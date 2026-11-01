// ============================================================================
// scripts/verify/verify-youtube — MBC충북 유튜브 어댑터 실연동 검증
//
// YouTube Data API v3 를 실제로 호출해 어댑터 계약이 지켜지는지 확인한다.
// Supabase·AI 키 없이 동작한다(어댑터만 검증 — DB 적재는 /api/cron/ingest 로).
//
// 검사 항목:
//   1) 키·채널 미설정 시 빈 배열 반환(파이프라인 무해) — 키 없는 로컬 보호
//   2) fetchArticles 가 영상을 수집하고 필수 계약을 지키는가
//      (kind='youtube' · external_id 'yt-' 접두사 · ISO 발행일 · since 필터)
//   3) fetchComments 가 댓글을 수집하는가 (감정분석 입력 확보)
//   4) 댓글 비활성 영상에서 throw 하지 않고 빈 배열을 주는가
//
// 실행: pnpm tsx scripts/verify/verify-youtube.ts
// 주의: API 키 값은 절대 출력하지 않는다(마스킹).
// ============================================================================

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MbcYoutubeAdapter } from "../../lib/adapters/mbc-youtube";

// ---------------------------------------------------------------------------
// 0) .env.local 로드 (dotenv 미설치 — scripts/report/eval-matching 과 동일 방식)
// ---------------------------------------------------------------------------
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
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

// ---------------------------------------------------------------------------
// 검사 결과 집계
// ---------------------------------------------------------------------------

const failures: string[] = [];

function check(label: string, passed: boolean, detail = ""): void {
  const mark = passed ? "✅" : "❌";
  console.log(`  ${mark} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!passed) failures.push(label);
}

/** 키를 노출하지 않고 설정 여부만 보고한다 */
function maskedStatus(value: string | undefined): string {
  if (!value?.trim()) return "미설정";
  return `설정됨(${value.trim().length}자)`;
}

// ---------------------------------------------------------------------------
// 메인
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  loadEnvLocal();

  const apiKey = process.env.YOUTUBE_API_KEY;
  const channelId = process.env.MBC_YOUTUBE_CHANNEL_ID;

  console.log("=== MBC충북 유튜브 어댑터 검증 ===\n");
  console.log(`YOUTUBE_API_KEY: ${maskedStatus(apiKey)}`);
  console.log(`MBC_YOUTUBE_CHANNEL_ID: ${channelId?.trim() || "미설정"}\n`);

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // --- 1) 키 없음 = 무해한 빈 결과 --------------------------------------
  if (!apiKey?.trim() || !channelId?.trim()) {
    console.log("[키 미설정 경로 검증]");
    const articles = await MbcYoutubeAdapter.fetchArticles(since);
    const comments = await MbcYoutubeAdapter.fetchComments("yt-dummy");
    check("키 없이 fetchArticles 가 빈 배열", articles.length === 0);
    check("키 없이 fetchComments 가 빈 배열", comments.length === 0);
    console.log(
      "\n⚠️ 실수집 검증은 건너뜀 — .env.local 에 YOUTUBE_API_KEY·MBC_YOUTUBE_CHANNEL_ID 를 넣고 다시 실행하세요.",
    );
    return report();
  }

  // --- 2) 영상 수집 계약 -------------------------------------------------
  // 어댑터는 6시간 슬롯(KST 0·6·12·18시)에만 수집한다(deliverables/04 §4).
  // 검증은 시각과 무관해야 하므로 강제 플래그로 게이트를 연다.
  process.env.YOUTUBE_INGEST_FORCE = "1";

  console.log("[영상 수집 (최근 30일, 주기 게이트 강제 해제)]");
  const articles = await MbcYoutubeAdapter.fetchArticles(since);
  check("영상 1건 이상 수집", articles.length > 0, `${articles.length}건`);

  if (articles.length > 0) {
    check(
      "external_id 가 'yt-' 접두사",
      articles.every((a) => a.externalId.startsWith("yt-")),
    );
    check("kind='youtube' 명시", articles.every((a) => a.kind === "youtube"));
    check(
      "발행일이 파싱 가능한 ISO",
      articles.every((a) => !Number.isNaN(Date.parse(a.publishedAt))),
    );
    check(
      "since 필터 준수 (30일 이내)",
      articles.every((a) => new Date(a.publishedAt).getTime() >= since.getTime()),
    );
    check(
      "external_id 중복 없음",
      new Set(articles.map((a) => a.externalId)).size === articles.length,
    );
    check("제목 비어있지 않음", articles.every((a) => a.title.trim().length > 0));

    const newest = articles[0];
    console.log(
      `     최신: "${newest.title.slice(0, 45)}" (${newest.publishedAt.slice(0, 10)})`,
    );
  }

  // --- 3) 댓글 수집 ------------------------------------------------------
  // 갓 올라온 영상은 댓글이 0인 게 정상이라 "최신 N개"만 보면 검사가 불안정하다.
  // 댓글이 붙은 영상을 만날 때까지 표본을 넓힌다.
  // 최신 영상(특히 LIVE 브리핑)은 댓글이 0인 게 정상이라 top-N 만 보면 불안정하다.
  // 댓글 붙은 영상 2개를 만날 때까지 표본을 넓힌다(최대 SAMPLE_CAP).
  const SAMPLE_CAP = 40;
  const ENOUGH = 2;
  console.log(`\n[댓글 수집 (댓글 영상 ${ENOUGH}개 찾을 때까지, 최대 ${SAMPLE_CAP}개 표본)]`);
  let totalComments = 0;
  let videosWithComments = 0;
  let scanned = 0;
  for (const article of articles.slice(0, SAMPLE_CAP)) {
    scanned += 1;
    const comments = await MbcYoutubeAdapter.fetchComments(article.externalId);
    totalComments += comments.length;
    if (comments.length > 0) {
      videosWithComments += 1;
      console.log(
        `     ${article.externalId}: ${comments.length}건 — "${article.title.slice(0, 28)}"`,
      );
      const bad = comments.filter(
        (c) => !c.externalId || !c.body.trim() || c.articleRef !== article.externalId,
      );
      check(`  ${article.externalId} 댓글 계약 준수`, bad.length === 0);
      if (videosWithComments >= ENOUGH) break;
    }
  }
  console.log(`     (영상 ${scanned}개 스캔)`);
  check(
    "감정분석 입력 확보 (표본 내 댓글 1건 이상)",
    totalComments > 0,
    `${totalComments}건 / 댓글 있는 영상 ${videosWithComments}개`,
  );

  // --- 4) 비정상 입력 방어 ----------------------------------------------
  console.log("\n[방어 동작]");
  const foreign = await MbcYoutubeAdapter.fetchComments("demo-mbc-bus");
  check("타 어댑터 기사 참조 시 빈 배열", foreign.length === 0);

  const missing = await MbcYoutubeAdapter.fetchComments("yt-xxxxxxxxxxx");
  check("존재하지 않는 영상에서 throw 안 함", Array.isArray(missing));

  report();
}

function report(): void {
  console.log("");
  if (failures.length === 0) {
    console.log("=== PASS — 어댑터 계약 전건 통과 ===");
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
