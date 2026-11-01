// ============================================================================
// scripts/verify/verify-ingest-guards — 수집 파이프라인 안전장치 회귀 검사
//
// Codex 리뷰(2026-07-19)에서 지적된 항목들이 실제로 막혔는지 확인한다.
// 외부 API·DB 없이 도는 순수 로직만 다룬다(DB 경로는 실 ingest 로 확인).
//
//   1) 수집 시점 PII 마스킹 (deliverables/04 §5)
//   2) 데모 어댑터 게이트 (DEMO_ADAPTERS=0 이면 실수집만)
//   3) 유튜브 6시간 주기 게이트 (deliverables/04 §4)
//   4) 폰트 캐시 상한 (프로세스 메모리 단조 증가 방지)
//   5) 매칭 1회 실행 상한 (백필 폭주 방지)
//
// 실행: pnpm verify:guards
// ============================================================================

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * .env.local 로드 — 키가 없으면 6시간 게이트 검사가 "키 부재로 빈 배열"과
 * 구분되지 않아 무의미해진다.
 */
function loadEnvLocal(): void {
  let raw: string;
  try {
    raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  } catch {
    return;
  }
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvLocal();

const failures: string[] = [];

function check(label: string, passed: boolean, detail = ""): void {
  console.log(`  ${passed ? "✅" : "❌"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!passed) failures.push(label);
}

async function main(): Promise<void> {
  console.log("=== 수집 파이프라인 안전장치 검증 ===\n");

  // --- 1) PII 마스킹 ------------------------------------------------------
  console.log("[수집 시점 PII 마스킹]");
  const { redactPii } = await import("../../lib/ingest/redact");
  const cases: Array<[string, string, string]> = [
    ["휴대폰(하이픈)", "연락처는 010-1234-5678 입니다", "010-1234-5678"],
    ["휴대폰(붙임)", "01012345678 로 연락주세요", "01012345678"],
    ["유선번호", "사무실 043-123-4567 입니다", "043-123-4567"],
    ["이메일", "문의는 hong@example.com 으로", "hong@example.com"],
    ["주민번호", "900101-1234567 확인 바랍니다", "900101-1234567"],
    ["카드번호", "1234-5678-9012-3456 결제됨", "1234-5678-9012-3456"],
  ];
  for (const [label, input, secret] of cases) {
    const out = redactPii(input);
    check(`${label} 마스킹`, !out.includes(secret), out.slice(0, 42));
  }
  // 오탐 방지 — 평범한 숫자는 건드리지 않아야 한다
  const benign = "버스 651번 노선이 2026년 7월에 3회 증편됩니다";
  check("일반 숫자 오탐 없음", redactPii(benign) === benign);

  // 정규화 단계에서 실제로 적용되는지 (어댑터가 무엇이든 통과하는 관문)
  const { normalizeComment } = await import("../../lib/ingest/normalize");
  const row = normalizeComment(
    {
      externalId: "t1",
      articleRef: "a1",
      body: "제 번호는 010-9999-8888 이고 메일은 me@test.com 입니다",
      authorRaw: "tester",
      publishedAt: new Date(0).toISOString(),
    },
    "mbc_cb",
  );
  check(
    "normalizeComment 이 본문을 마스킹",
    !row.body.includes("010-9999-8888") && !row.body.includes("me@test.com"),
    row.body.slice(0, 46),
  );
  check("작성자는 해시로 저장", Boolean(row.author_hash) && row.author_hash !== "tester");

  // --- 2) 데모 어댑터 게이트 ---------------------------------------------
  console.log("\n[데모/실수집 분리]");
  process.env.DEMO_ADAPTERS = "0";
  const offRegistry = await import(`../../lib/adapters/registry?off=${Date.now()}`);
  const offIds = (offRegistry.adapters as Array<{ id: string }>).map((a) => a.id);
  check(
    "DEMO_ADAPTERS=0 이면 데모 제외",
    !offIds.some((id) => id.startsWith("demo")),
    offIds.join(", "),
  );
  check("실수집 어댑터는 유지", offIds.includes("mbc_cb") && offIds.includes("okinews"));

  // --- 3) 유튜브 6시간 게이트 --------------------------------------------
  console.log("\n[유튜브 6시간 주기 게이트]");
  delete process.env.YOUTUBE_INGEST_FORCE;
  const { MbcYoutubeAdapter } = await import("../../lib/adapters/mbc-youtube");
  const hadKey = Boolean(process.env.YOUTUBE_API_KEY?.trim());
  // 키가 없으면 빈 배열이 게이트 때문인지 키 부재 때문인지 구분되지 않는다.
  // 키가 없는 환경(CI·공개 리포 클론)은 실패가 아니라 건너뜀 — 게이트 로직은 키가 있는 운영 머신에서 검증한다(2026-10-26, 공개 리포 CI 실패 수정)
  if (hadKey) check("검증 전제: API 키 설정됨", true, "설정됨");
  else console.log("  ⏭ 검증 전제: API 키 미설정 — 게이트 검증 건너뜀(실패로 치지 않음)");

  const kstHour = new Date(Date.now() + 9 * 3600_000).getUTCHours();
  const isSlot = kstHour % 6 === 0;
  const since = new Date(Date.now() - 30 * 864e5);

  if (!hadKey) {
    console.log("     키가 없어 게이트 검증을 건너뜁니다.");
  } else if (isSlot) {
    // 슬롯 시각이면 차단이 아니라 "수집됨"이 정상 — 게이트가 막지 않는지 본다.
    const articles = await MbcYoutubeAdapter.fetchArticles(since);
    check(
      `수집 슬롯(KST ${kstHour}시)에는 수집함`,
      articles.length > 0,
      `${articles.length}건`,
    );
  } else {
    const blocked = await MbcYoutubeAdapter.fetchArticles(since);
    check(
      `비수집 시각(KST ${kstHour}시)에는 수집 안 함`,
      blocked.length === 0,
      `${blocked.length}건`,
    );
    // 강제 플래그로는 뚫려야 한다 — 게이트가 이유임을 증명한다.
    process.env.YOUTUBE_INGEST_FORCE = "1";
    const forced = await MbcYoutubeAdapter.fetchArticles(since);
    delete process.env.YOUTUBE_INGEST_FORCE;
    check(
      "FORCE=1 이면 수집됨 (0건이 게이트 때문임을 증명)",
      forced.length > 0,
      `${forced.length}건`,
    );
  }

  // --- 4) 폰트 캐시 상한 --------------------------------------------------
  console.log("\n[폰트 캐시 상한]");
  const fontsSrc = await import("node:fs").then((fs) =>
    fs.readFileSync(new URL("../../lib/og/fonts.ts", import.meta.url), "utf8"),
  );
  check(
    "LRU 상한이 코드에 존재",
    /MAX_CACHE_ENTRIES\s*=\s*\d+/.test(fontsSrc) && /cache\.delete\(oldest\)/.test(fontsSrc),
  );

  // --- 4-1) 증분 창이 데모에 오염되지 않는지 -----------------------------
  // 데모는 발행일을 항상 "몇 시간 전"으로 만들고 실수집분과 같은 source 로
  // 적재된다. 커서 계산에 포함하면 실제 기사(주간지 등)가 영구히 누락된다.
  console.log("\n[증분 창 오염 방지]");
  const ingestSrc = await import("node:fs").then((fs) =>
    fs.readFileSync(new URL("../../lib/ingest/ingest.ts", import.meta.url), "utf8"),
  );
  check(
    "high-water 계산에서 데모(demo-*) 제외",
    /\.not\(\s*["']external_id["']\s*,\s*["']like["']/.test(ingestSrc) &&
      /DEMO_ID_PREFIX/.test(ingestSrc),
  );

  // --- 5) 매칭 1회 실행 상한 ---------------------------------------------
  console.log("\n[매칭 1회 실행 상한]");
  const { DEFAULT_MATCH_OPTIONS } = await import("../../lib/matching/types");
  const cap = (DEFAULT_MATCH_OPTIONS as { maxArticlesPerRun?: number }).maxArticlesPerRun;
  check("maxArticlesPerRun 기본값 존재", typeof cap === "number" && cap > 0, `${cap}건`);
  check("상한이 합리적 범위(≤200)", typeof cap === "number" && cap <= 200);

  // --- 6) 지면 인덱스 페이지 매칭 제외 (회귀) -----------------------------
  // 옥천 "NNNN호 지면 보기"는 본문 없는 목차라 요약이 제목 반복으로 퇴화하고
  // 크로스뷰 목록 상단을 차지했다(2026-08-02 라이브 20건 중 2건).
  console.log("\n[지면 인덱스 페이지 제외]");
  const { isIndexPageArticle } = await import("../../lib/matching/candidates");
  const asArticle = (title: string) => ({ title }) as Parameters<typeof isIndexPageArticle>[0];
  check("'1852호 지면 보기' 제외", isIndexPageArticle(asArticle("1852호 지면 보기")));
  check("공백 변형 '1853호  지면보기' 제외", isIndexPageArticle(asArticle("1853호  지면보기")));
  check(
    "실기사 '금강IC 이설 건의문' 은 통과",
    !isIndexPageArticle(asArticle("금강IC 이설 건의문에 대한 입장")),
  );
  check(
    "제목에 '지면 보기'가 포함만 된 실기사는 통과",
    !isIndexPageArticle(asArticle("1852호 지면 보기 서비스 개편 안내")),
  );

  report();
}

function report(): void {
  console.log("");
  if (failures.length === 0) {
    console.log("=== PASS — 안전장치 전건 통과 ===");
  } else {
    console.log(`=== FAIL — ${failures.length}건 실패 ===`);
    for (const f of failures) console.log(`  - ${f}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("검증 중 예외:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
