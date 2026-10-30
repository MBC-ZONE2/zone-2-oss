// ============================================================================
// scripts/verify/verify-local-ai — 구독 CLI(codex·claude) AI 경로 실동작 검증
//
// AI API 키 대신 머신에 로그인된 구독 CLI 로 텍스트 생성을 돌리는 경로가
// 실제로 작동하는지 확인한다(2026-08-02 결정). mock 이 아니라 **진짜 CLI 를
// 호출**하므로 몇 십 초 걸린다.
//
// 실행:  LOCAL_AI_CLI=codex pnpm verify:local-ai
//        LOCAL_AI_CLI=claude pnpm verify:local-ai
//
// 통과 기준은 "그럴듯한 문장"이 아니라 **mock 과 달라졌는지**다:
//   1) 감정 분류가 텍스트 의미를 반영하는가 (비판글=neg, 감사글=pos)
//   2) 요약이 제목 되풀이가 아닌가 ("N호 지면 보기" 퇴화 방지)
//   3) 재랭킹이 무관한 쌍을 낮게 매기는가
// ============================================================================

import type { Article } from "../../types";

const failures: string[] = [];

function check(label: string, passed: boolean, detail = ""): void {
  console.log(`  ${passed ? "✅" : "❌"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!passed) failures.push(label);
}

/** 최소 필드만 채운 기사 (매칭·요약 경로는 title/body 만 본다). */
function article(id: string, title: string, body: string): Article {
  return {
    id,
    source: "okinews",
    kind: "news",
    externalId: id,
    url: null,
    title,
    body,
    category: null,
    keywords: [],
    publishedAt: "2026-08-01T00:00:00.000Z",
    embedding: null,
    raw: null,
    createdAt: "2026-08-01T00:00:00.000Z",
  } as unknown as Article;
}

async function main(): Promise<void> {
  const kind = process.env.LOCAL_AI_CLI;
  console.log(`=== 구독 CLI AI 경로 검증 (LOCAL_AI_CLI=${kind ?? "미설정"}) ===\n`);

  const { isLocalCliMode } = await import("../../lib/ai/local-cli");
  if (!isLocalCliMode()) {
    console.log("LOCAL_AI_CLI 가 codex/claude 가 아닙니다. 예:");
    console.log("  LOCAL_AI_CLI=codex pnpm verify:local-ai");
    process.exitCode = 1;
    return;
  }

  // --- 0) 감정 로컬 모델 (LOCAL_SENTIMENT=1 일 때만) -----------------------
  // 감정은 고빈도·좁은 분류라 LLM 보다 전용 모델이 낫다(#85). 켜져 있으면
  // classifySentiment 가 이 경로를 **먼저** 타므로 따로 확인해 둔다.
  const { isLocalSentimentMode, classifySentimentLocally } = await import(
    "../../lib/ai/local-sentiment"
  );
  if (isLocalSentimentMode()) {
    console.log("[감정 로컬 모델 — KcELECTRA 11감정]");
    const tm = Date.now();
    const modelLabels = await classifySentimentLocally([
      "주민을 바보로 아는 군의원. 이런 식이면 다음 선거에서 심판받을 것이다.",
      "안 효익 의장님의 열정적인 활동과 성실한 답변에 깊이 감사드립니다.",
    ]);
    console.log(`     (${((Date.now() - tm) / 1000).toFixed(1)}s)`);
    check("모델이 결과를 반환(폴백 아님)", modelLabels !== null, String(modelLabels));
    if (modelLabels) {
      console.log(`     ${modelLabels.join(" / ")}`);
      check("비판 글을 neg 로 분류", modelLabels[0] === "neg", modelLabels[0]);
      check("감사 글을 pos 로 분류", modelLabels[1] === "pos", modelLabels[1]);
    }
    console.log("");
  } else {
    console.log("[감정 로컬 모델] LOCAL_SENTIMENT=1 이 아니라 건너뜁니다(#85)\n");
  }

  // --- 1) 감정 분류 -------------------------------------------------------
  // 온도 수식의 β(감정 분산) 성분은 이 값이 있어야 산다. mock 은 해시 기반이라
  // 의미와 무관했고, 실측에서 sentimentVar 가 전건 0 이었다(#81).
  console.log("[감정 분류]");
  const { classifySentiment } = await import("../../lib/ai/sentiment");
  const texts = [
    "주민을 바보로 아는 군의원. 이런 식이면 다음 선거에서 심판받을 것이다.",
    "안 효익 의장님의 열정적인 활동과 성실한 답변에 깊이 감사드립니다.",
    "옥천군 제2청사 위치는 어디로 정해졌나요?",
  ];
  const t0 = Date.now();
  const labels = await classifySentiment(texts);
  console.log(`     (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  texts.forEach((t, i) => console.log(`     ${labels[i]}  ${t.slice(0, 34)}…`));
  check("비판 글을 neg 로 분류", labels[0] === "neg", labels[0]);
  check("감사 글을 pos 로 분류", labels[1] === "pos", labels[1]);
  check(
    "라벨이 한 종류로 뭉치지 않음(분산 존재)",
    new Set(labels).size >= 2,
    `${new Set(labels).size}종`,
  );

  // --- 2) 크로스뷰 요약 ---------------------------------------------------
  // mock 은 본문 앞문장 발췌 + 제목 되풀이라 "N호 지면 보기" 같은 제목에서
  // 통째로 퇴화했다. 실제 요약은 제목을 그대로 복사하지 않아야 한다.
  console.log("\n[크로스뷰 요약]");
  const { summarizeCrossview } = await import("../../lib/ai/summarize");
  const macro = article(
    "m1",
    "충북도, 금강IC 이설 타당성 용역 착수",
    "충청북도는 옥천군이 요구해 온 금강IC 이설과 관련해 타당성 조사 용역을 발주했다고 밝혔다. 도는 국토교통부 협의와 예산 확보 절차를 병행한다는 계획이다.",
  );
  const micro = article(
    "u1",
    "금강IC 이설 건의문에 대한 입장",
    "옥천 주민들은 금강IC 이설이 생활권 이동과 직결된다며 조속한 추진을 요구했다. 군은 주민 설명회를 열어 의견을 수렴하겠다고 밝혔다.",
  );
  const t1 = Date.now();
  const summary = await summarizeCrossview(macro, micro);
  console.log(`     (${((Date.now() - t1) / 1000).toFixed(1)}s)`);
  console.log(`     광역: ${summary.macro.slice(0, 60)}…`);
  console.log(`     기초: ${summary.micro.slice(0, 60)}…`);
  console.log(`     리딩: ${summary.readingPoint}`);
  check("광역 요약이 제목 복사가 아님", summary.macro.trim() !== macro.title);
  check("기초 요약이 제목 복사가 아님", summary.micro.trim() !== micro.title);
  check(
    "리딩포인트가 mock 템플릿이 아님",
    !summary.readingPoint.includes("같은 사안, 두 개의 시선"),
    summary.readingPoint.slice(0, 40),
  );

  // --- 3) 재랭킹 ----------------------------------------------------------
  // 같은 사건은 높게, 무관한 사건은 낮게. mock(어휘 겹침)은 이 구분이 얕았다.
  console.log("\n[재랭킹]");
  const { rerankMatches } = await import("../../lib/ai/rerank");
  const related = article("c1", "금강IC 이설 주민 설명회 개최", micro.body ?? "");
  const unrelated = article(
    "c2",
    "청산초 아이들, 글램핑 물놀이장서 물놀이",
    "청산초등학교 학생들이 하예곡리 글램핑장 물놀이장을 찾아 여름을 즐겼다.",
  );
  const t2 = Date.now();
  const scores = await rerankMatches(macro, [related, unrelated]);
  console.log(`     (${((Date.now() - t2) / 1000).toFixed(1)}s)`);
  scores.forEach((s) => console.log(`     ${s.score.toFixed(2)}  ${s.id}`));
  const byId = new Map(scores.map((s) => [s.id, s.score]));
  check("모든 후보에 점수 반환", scores.length === 2);
  check(
    "관련 기사 > 무관 기사",
    (byId.get("c1") ?? 0) > (byId.get("c2") ?? 0),
    `c1=${byId.get("c1")} c2=${byId.get("c2")}`,
  );

  console.log("");
  if (failures.length === 0) {
    console.log("=== PASS — 구독 CLI 경로 전건 통과 ===");
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
