// ============================================================================
// lib/ai/sentiment — 댓글 감정 분류 (Claude 배치)
//
// 시그니처 출처: docs/06-API명세.md §7
// 모든 호출은 Cloudflare AI Gateway 경유 (타임아웃·재시도·캐싱 적용 예정).
// 개발 모드(AI_MOCK=1 또는 ANTHROPIC_API_KEY 없음)에서는 더미 감정 라벨을 낸다.
// ============================================================================

import { generateObject } from "ai";
import { z } from "zod";
import type { Sentiment } from "@/types";
import { CLAUDE_FAST_MODEL, getAnthropic } from "./gateway";
import { generateJsonViaCli, isLocalCliMode } from "./local-cli";
import { classifySentimentLocally, isLocalSentimentMode } from "./local-sentiment";
import { hashString, isMockMode } from "./mock";

/** 해시 분포용 라벨 순서 (인덱스 매핑). */
const SENTIMENT_LABELS: Sentiment[] = ["pos", "neg", "neu"];

/**
 * Claude 구조화 출력 스키마: 입력 순서대로 감정 라벨 배열.
 * index 를 명시해 모델이 순서·개수를 어긋나지 않게 유도한다.
 */
const SentimentSchema = z.object({
  results: z
    .array(
      z.object({
        index: z.number().int().describe("입력 댓글의 0-기반 순번"),
        label: z
          .enum(["pos", "neg", "neu"])
          .describe("감정: pos(긍정)/neg(부정)/neu(중립)"),
      }),
    )
    .describe("모든 입력 댓글에 대한 감정 라벨(입력 순서대로)"),
});

/**
 * [MOCK] 텍스트 해시 기반 결정적 감정 라벨.
 * 해시 % 3 으로 pos/neg/neu 에 고르게 분산(같은 텍스트 → 같은 라벨).
 * 실제 의미 분석이 아니다(온도계/분포 집계 파이프라인 구동용).
 */
function mockSentiment(text: string): Sentiment {
  return SENTIMENT_LABELS[hashString(text) % SENTIMENT_LABELS.length];
}

/** 순번을 붙인 댓글 목록 — 모델이 index 를 어긋내지 않게 한다. */
function numberTexts(texts: string[]): string {
  return texts
    .map((t, i) => `[${i}] ${t.replace(/\s+/g, " ").trim()}`)
    .join("\n");
}

/** 어느 경로가 라벨을 냈는지 — 온도 산출 통계(temperature_runs.stats)·경보용 */
export type SentimentProvider = "local" | "cli" | "mock" | "claude";

export interface SentimentBatchResult {
  /** 입력 순서와 동일한 감정 라벨 배열 */
  labels: Sentiment[];
  provider: SentimentProvider;
  /** 모델이 순번을 빠뜨려 중립(neu)으로 메운 개수 — 0 이 정상 */
  fallback: number;
  /** 로컬 모델이 켜져 있는데 실패해 아래 경로로 내려갔는지 */
  localFailed: boolean;
}

/**
 * 댓글 감정 분류 (배치) — 라벨과 함께 **어느 경로가 냈는지·몇 건을 중립으로 메웠는지**를 돌려준다.
 * 실패가 neu 로 조용히 묻히던 것(#181 결함 A)을 호출부가 기록·경보할 수 있게 한다.
 * 경로 순서: 로컬 모델(LOCAL_SENTIMENT=1) → 구독 CLI → mock(키 없음) → Claude(Haiku).
 */
export async function classifySentimentDetailed(texts: string[]): Promise<SentimentBatchResult> {
  if (texts.length === 0) return { labels: [], provider: "local", fallback: 0, localFailed: false };

  let localFailed = false;
  // [로컬 모델] 최우선. 감정은 고빈도·좁은 분류라 전용 모델이 LLM 보다 낫다
  // — 수십 ms/건 · 무료 · 결정적. 실패하면 아래 구독 CLI 로 내려간다.
  if (isLocalSentimentMode()) {
    const viaModel = await classifySentimentLocally(texts);
    if (viaModel) return { labels: viaModel, provider: "local", fallback: 0, localFailed: false };
    localFailed = true;
  }

  // [구독 CLI] 키 없이 실제 감정 분류. 실패하면 아래 로컬 폴백으로 내려간다.
  // 온도 수식의 β(감정 분산) 성분은 이 값이 있어야 살아난다.
  if (isLocalCliMode()) {
    const viaCli = await generateJsonViaCli(SentimentSchema, {
      label: "sentiment",
      system:
        "당신은 한국어 댓글 감정 분류기다. 각 댓글을 pos(긍정)/neg(부정)/neu(중립) " +
        "중 하나로 분류한다. 반드시 입력의 모든 순번(index)에 대해 결과를 반환하라.",
      prompt: `다음 댓글들을 순번별로 감정 분류하라.\n${numberTexts(texts)}`,
      format:
        '{"results":[{"index":0,"label":"pos|neg|neu"}, ...]} — ' +
        `index 는 0부터 ${texts.length - 1} 까지 전부 포함할 것.`,
    });
    if (viaCli) {
      const labelByIndex = new Map<number, Sentiment>(
        viaCli.results.map((r) => [r.index, r.label]),
      );
      let fallback = 0;
      const labels = texts.map((_, i) => {
        const l = labelByIndex.get(i);
        if (l) return l;
        fallback += 1;
        return "neu" as const;
      });
      return { labels, provider: "cli", fallback, localFailed };
    }
  }

  // [MOCK] 키 없이 감정 분포/온도 산출 구동용 더미 라벨 (결정적)
  if (isMockMode("anthropic")) {
    return { labels: texts.map(mockSentiment), provider: "mock", fallback: 0, localFailed };
  }

  // 실제 호출: Claude(Haiku) 배치 분류. 대량 댓글이므로 경량 모델로 비용 절감.
  const anthropic = getAnthropic();
  const numbered = numberTexts(texts);

  const { object } = await generateObject({
    model: anthropic(CLAUDE_FAST_MODEL),
    schema: SentimentSchema,
    schemaName: "SentimentBatch",
    system:
      "당신은 한국어 댓글 감정 분류기다. 각 댓글을 pos(긍정)/neg(부정)/neu(중립) " +
      "중 하나로 분류한다. 반드시 입력의 모든 순번(index)에 대해 결과를 반환하라.",
    prompt: `다음 댓글들을 순번별로 감정 분류하라.\n${numbered}`,
  });

  // 모델 응답을 index 기준으로 정합화: 누락/범위초과는 중립(neu)으로 보정하되 개수를 센다.
  const labelByIndex = new Map<number, Sentiment>(
    object.results.map((r) => [r.index, r.label]),
  );
  let fallback = 0;
  const labels = texts.map((_, i) => {
    const l = labelByIndex.get(i);
    if (l) return l;
    fallback += 1;
    return "neu" as const;
  });
  return { labels, provider: "claude", fallback, localFailed };
}

/**
 * 댓글 감정 분류 (Claude 배치). 대량 시 Haiku + AI Gateway 캐싱.
 * @returns 입력 순서와 동일한 감정 라벨 배열 — 경로·누락 통계가 필요하면 classifySentimentDetailed.
 */
export async function classifySentiment(texts: string[]): Promise<Sentiment[]> {
  return (await classifySentimentDetailed(texts)).labels;
}
