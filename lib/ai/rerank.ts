// ============================================================================
// lib/ai/rerank — 크로스뷰 후보 재랭킹 (Claude)
//
// 시그니처 출처: docs/06-API명세.md §7
// 모든 호출은 Cloudflare AI Gateway 경유 (타임아웃·재시도·캐싱 적용 예정).
// 개발 모드(AI_MOCK=1 또는 ANTHROPIC_API_KEY 없음)에서는 결정적 더미 점수를 낸다.
// ============================================================================

import { generateObject } from "ai";
import { z } from "zod";
import type { Article } from "@/types";
import { CLAUDE_MODEL, getAnthropic } from "./gateway";
import { generateJsonViaCli, isLocalCliMode } from "./local-cli";
import { isMockMode } from "./mock";
import { localEmbedding } from "./local-embed";

/** 본문은 토큰 절감을 위해 앞부분만 사용한다(재랭킹 판단에 충분). */
const BODY_CLIP = 600;

/** 재랭킹에 사용할 기사 비교 텍스트(제목 + 본문 일부). */
function rerankText(article: Article): string {
  return `${article.title}\n${article.body ?? ""}`;
}

/** Claude 구조화 출력 스키마: 후보 id 별 적합도 점수(0~1). */
const RerankSchema = z.object({
  scores: z
    .array(
      z.object({
        id: z.string().describe("후보 기사 id (입력으로 준 id 그대로)"),
        score: z
          .number()
          .min(0)
          .max(1)
          .describe("광역 기사와의 동일 사안 적합도 0~1 (1=같은 사안)"),
      }),
    )
    .describe("모든 후보에 대한 점수 배열"),
});

/** 두 L2 정규화 벡터의 코사인 유사도(=내적) */
function cosine(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i += 1) dot += a[i] * b[i];
  return dot;
}

/**
 * [로컬] 광역 기사와 후보의 어휘 겹침(로컬 임베딩 코사인)으로 적합도를 매긴다.
 * 이전 mock 은 길이+해시라 무의미했다 — 여기서는 실제 주제 유사도를 반영한다.
 * 코사인(0~1 부근)을 게시 임계(0.6) 주변으로 살짝 늘려 매칭 신호를 준다.
 */
function localScore(macroVec: number[], candidate: Article): number {
  const sim = cosine(macroVec, localEmbedding(rerankText(candidate)));
  // 어절 코사인은 실데이터에서 같은 주제 ≈0.12~0.15 / 무관 ≈0.02~0.08 대다(실측).
  // MBC충북(전역)과 옥천(로컬)은 주제 겹침이 얇아 절대값이 낮으므로 ×5 로 늘려
  // 게시대(0.6)로 당긴다. 무관 쌍은 0.4 이하라 임계에서 걸러진다.
  const scaled = Math.min(1, sim * 5);
  return Number(scaled.toFixed(4));
}

/**
 * 크로스뷰 후보 재랭킹 (Claude). 광역 기사 기준으로 후보들의 적합도를 점수화.
 * @returns { id, score(0~1) } 배열 (점수 내림차순 권장)
 */
export async function rerankMatches(
  macro: Article,
  candidates: Article[],
): Promise<{ id: string; score: number }[]> {
  if (candidates.length === 0) return [];

  // [구독 CLI] 키 없이 실제 의미 재랭킹. 지금까지 수동으로 돌리던
  // `codex exec` 정제(HANDOFF §2-2 C)를 파이프라인 안으로 넣은 것이다.
  if (isLocalCliMode()) {
    // 프롬프트: 뉴스 event-coreference(동일 사건 판정) 관행 — 주제 겹침이 아닌
    // 사건 핵심 5W(주체·행위·시점·장소) 일치로 채점(mock "전부 1.0" 문제 방지).
    // effort 는 env(LOCAL_AI_CLI_EFFORT=high) 로 품질 우선.
    const viaCli = await generateJsonViaCli(RerankSchema, {
      label: "rerank",
      system:
        "당신은 지역 뉴스 편집 데스크의 '동일 사건 매칭(event coreference)' **엄격 심사관**이다. " +
        "광역(도 단위, MBC충북) 기사 1건과 여러 기초(시·군, 옥천신문) 후보가 **문자 그대로 같은 하나의 " +
        "사건/사안**을 보도하는지 0~1 로 채점한다.\n" +
        "판정 절차(각 후보마다): ①광역 기사가 가리키는 **구체적 사건**을 '누가·무엇을·언제·어디서'로 특정한다. " +
        "②후보 기사의 사건도 같은 방식으로 특정한다. ③두 사건의 **4요소(주체·사안·시점·장소)가 실질적으로 " +
        "동일**할 때만 높은 점수. 하나라도 어긋나면 낮게.\n" +
        "⚠️ 다음은 전부 **0.1 이하(무관)** 로 처리한다 — 흔한 함정이다: " +
        "· 같은 지역(옥천/충북)·같은 분야(둘 다 교통·행정·축제·선거)라는 이유만으로 묶기 " +
        "· 같은 인물·기관이 등장하지만 사안이 다름 " +
        "· 막연히 '옥천 관련'.\n" +
        "⚠️⚠️ **국면(단계) 차이 = 별개 사건 = 0.3 이하**. 가장 빈번한 오답 원인이다. 같은 대상·같은 " +
        "사안이라도 **진행 단계가 다르면 서로 다른 사건**으로 본다: 발주↔착공↔준공, 심사·선정↔감사·점검, " +
        "운항 중단↔재개, 예고·계획↔결과·시행, 사전투표↔본투표, 신청·접수↔선정·발표. 이런 쌍은 " +
        "제목이 비슷해 임베딩상 가깝지만 **정답이 아니다** — 반드시 0.3 이하로 낮춘다.\n" +
        "루브릭: **1.0 = 4요소 일치 + 같은 국면, 같은 사건 직접 보도(확신)** / 0.7 = 같은 사건·같은 국면을 " +
        "양쪽이 보도(4요소 일치하나 세부 서술만 다름) / **0.3 = 같은 대상·사안이나 국면이 다르거나 별개 사건** " +
        "/ 0.1 이하 = 무관.\n" +
        "**중요: 대부분의 후보는 오답이다. 확신이 없으면 낮게 준다. 만점(1.0)은 정말 같은 하나의 사건이라고 " +
        "단정할 수 있을 때만 아껴서 준다. 여러 후보에 1.0 을 남발하지 마라 — 보통 정답은 0~2개다.**",
      prompt:
        `[광역 기사]\n제목: ${macro.title}\n본문: ${(macro.body ?? "").slice(0, BODY_CLIP)}\n\n` +
        `[후보 기사 목록]\n${candidateBlock(candidates)}`,
      format:
        '{"scores":[{"id":"<입력 id 그대로>","score":0.0}, ...]} — ' +
        `후보 ${candidates.length}건 전부에 대해 점수를 낼 것. 위 절차대로 4요소를 대조한 뒤 채점하라.`,
    });
    if (viaCli) {
      const cliScores = new Map(viaCli.scores.map((s) => [s.id, s.score]));
      return candidates
        .map((c) => ({ id: c.id, score: clamp01(cliScores.get(c.id) ?? 0) }))
        .sort((a, b) => b.score - a.score);
    }
    // ⚠️ 사용자 방침: 구독 CLI 재랭킹 실패 시 목업/로컬로 폴백하지 않는다(키 없을 때).
    //    throw → 매칭 엔진이 그 기사를 스킵하고 system_alerts 경고를 남긴다.
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("구독 CLI(codex) 재랭킹 실패 — 목업 폴백 없이 스킵");
    }
  }

  // [로컬] 키 없이 어휘 겹침 기반 점수 (결정적, 내림차순 정렬)
  if (isMockMode("anthropic")) {
    const macroVec = localEmbedding(rerankText(macro));
    return candidates
      .map((candidate) => ({
        id: candidate.id,
        score: localScore(macroVec, candidate),
      }))
      .sort((a, b) => b.score - a.score);
  }

  if (candidates.length === 0) return [];

  // 실제 호출: Claude 가 광역 기사와 각 후보의 "동일 사안 적합도"를 0~1 로 채점.
  const anthropic = getAnthropic();

  const { object } = await generateObject({
    model: anthropic(CLAUDE_MODEL),
    schema: RerankSchema,
    schemaName: "RerankScores",
    system:
      "당신은 충북 지역 뉴스 큐레이터다. 광역(도 단위) 기사와 여러 후보 기사가 " +
      "'같은 사안'을 다루는지 판단해 0~1 적합도를 매긴다. 1에 가까울수록 동일 사안, " +
      "0에 가까울수록 무관하다. 반드시 입력으로 받은 모든 후보 id에 대해 점수를 반환하라.",
    prompt:
      `[광역 기사]\n제목: ${macro.title}\n본문: ${(macro.body ?? "").slice(0, BODY_CLIP)}\n\n` +
      `[후보 기사 목록]\n${candidateBlock(candidates)}`,
  });

  // 모델 응답을 입력 id 기준으로 정합화: 누락 후보는 0점, 점수는 0~1 로 클램프.
  const scoreById = new Map(object.scores.map((s) => [s.id, s.score]));
  return candidates
    .map((c) => ({
      id: c.id,
      score: clamp01(scoreById.get(c.id) ?? 0),
    }))
    .sort((a, b) => b.score - a.score);
}

/** 후보 목록을 프롬프트용 블록으로 (id·제목·본문 일부). */
function candidateBlock(candidates: Article[]): string {
  return candidates
    .map(
      (c) =>
        `- id: ${c.id}\n  제목: ${c.title}\n  본문: ${(c.body ?? "").slice(0, BODY_CLIP)}`,
    )
    .join("\n");
}

/** 0~1 범위로 클램프. */
function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}
