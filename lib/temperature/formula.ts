// ============================================================================
// lib/temperature/formula — 온도 산출 순수 수식 (외부 의존성 없음)
//
// 출처: docs/01-기능정의.md §기능②, docs/04-데이터모델.md §기능②
//   Score = α·Freq + β·SentVar + γ·TopicConc  (α=0.4 / β=0.35 / γ=0.25 고정)
//   temperature = 100 * (0.4*Freq_norm + 0.35*SentVar_norm + 0.25*TopicConc_norm)
//   시간가중 decay λ=0.95 (L2-a 키워드 빈도)
//
// 모든 함수는 순수 함수(부수효과 없음)로 두어 검증·재사용을 쉽게 한다.
// ============================================================================

import type { Sentiment } from "@/types";

// ---------------------------------------------------------------------------
// 고정 상수 (검증·보고서 일관성을 위해 docs 에서 고정한 값)
// ---------------------------------------------------------------------------

/** 빈도 가중치 α */
export const ALPHA = 0.4;
/** 감정 분산 가중치 β */
export const BETA = 0.35;
/** 토픽 집중도 가중치 γ */
export const GAMMA = 0.25;

/** 시간가중 decay 상수 λ */
export const DECAY_LAMBDA = 0.95;

/** decay 의 한 스텝 단위(시간). 1시간마다 λ 를 1회 곱한다. */
export const DECAY_STEP_HOURS = 1;

/** 온도 스케일 상한 */
export const TEMP_MAX = 100;

// ---------------------------------------------------------------------------
// 온도계 표시 밴드 (0~100) — 정본: deliverables/03-공론온도계-기준안.md §6.
//   ⚠️ 산출 수식(ALPHA/BETA/GAMMA/decay)과 무관한 "표시" 밴드다.
//   잠잠(0~19,청) → 미온(20~39,연두) → 보통(40~59,황) → 뜨거움(60~79,주황)
//   → 매우 뜨거움(80~100,적). 게이지·배지·랭킹·차트가 공유하는 단일 소스(SSOT).
//   경계는 [min, max) 로 해석한다(마지막 구간만 100 포함).
// ---------------------------------------------------------------------------

/** 색맹 대체 패턴 종류 (배지·게이지 공용, 5종) */
export type TemperaturePattern =
  | "dots"
  | "horizontal"
  | "diagonal"
  | "grid"
  | "dashed";

export interface TemperatureBand {
  /** 구간 하한(포함) */
  min: number;
  /** 구간 상한(미만, 마지막 구간만 포함) */
  max: number;
  /** 사람이 읽는 라벨 */
  label: string;
  /** 게이지/차트/랭킹 라인용 HEX 색상 (F1 온도 토큰과 동일 값) */
  color: string;
  /** 배지 배경용 CSS 변수 참조 (F1 토큰) */
  colorVar: string;
  /** Tailwind 텍스트 색 유틸 */
  textClass: string;
  /** Tailwind 옅은 배경 유틸 */
  bgClass: string;
  /** 색맹 대체 패턴 */
  pattern: TemperaturePattern;
}

/** 온도 표시 5구간 (낮음→높음). 경계는 [min, max) 로 해석한다. */
export const TEMPERATURE_BANDS: readonly TemperatureBand[] = [
  {
    min: 0,
    max: 20,
    label: "잠잠",
    color: "#93c5fd", // 청색 · --temp-1
    colorVar: "var(--temp-1)",
    textClass: "text-sky-500",
    bgClass: "bg-sky-500/10",
    pattern: "dots",
  },
  {
    min: 20,
    max: 40,
    label: "미온",
    color: "#86efac", // 연두 · --temp-2
    colorVar: "var(--temp-2)",
    textClass: "text-emerald-500",
    bgClass: "bg-emerald-500/10",
    pattern: "horizontal",
  },
  {
    min: 40,
    max: 60,
    label: "보통",
    color: "#fde047", // 황색 · --temp-3
    colorVar: "var(--temp-3)",
    textClass: "text-yellow-500",
    bgClass: "bg-yellow-500/10",
    pattern: "diagonal",
  },
  {
    min: 60,
    max: 80,
    label: "뜨거움",
    color: "#fdba74", // 주황 · --temp-4
    colorVar: "var(--temp-4)",
    textClass: "text-orange-500",
    bgClass: "bg-orange-500/10",
    pattern: "grid",
  },
  {
    min: 80,
    max: 100.0001, // 마지막 구간은 100 포함
    label: "매우 뜨거움",
    color: "#fca5a5", // 적색 · --temp-5
    colorVar: "var(--temp-5)",
    textClass: "text-red-500",
    bgClass: "bg-red-500/10",
    pattern: "dashed",
  },
] as const;

/** 온도값(0~100)에 해당하는 표시 구간을 반환한다. 경계 [min, max). */
export function bandForTemperature(temperature: number): TemperatureBand {
  const t = clamp01to100(temperature);
  // 마지막 구간을 fallback 으로 두고 앞에서부터 [min, max) 매칭
  return (
    TEMPERATURE_BANDS.find((b) => t >= b.min && t < b.max) ??
    TEMPERATURE_BANDS[TEMPERATURE_BANDS.length - 1]
  );
}

// ---------------------------------------------------------------------------
// 수치 유틸
// ---------------------------------------------------------------------------

/** 0~100 범위로 클램프 */
export function clamp01to100(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > TEMP_MAX) return TEMP_MAX;
  return value;
}

/** 0~1 범위로 클램프 (NaN/Infinity 방어) */
export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/**
 * Min-Max 정규화 → 0~1.
 * 분포가 평평하면(max===min) 0 을 반환한다(상대 비교 불가 → 가산 0).
 */
export function normalize(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  if (max <= min) return 0;
  return clamp01((value - min) / (max - min));
}

// ---------------------------------------------------------------------------
// L2-a 빈도 + decay
// ---------------------------------------------------------------------------

/**
 * 시간가중 빈도. 각 항목의 경과 시간(시간 단위)에 λ^(Δt/step) 을 곱해 합산한다.
 * 최근 댓글일수록 가중치 1 에 가깝고, 오래될수록 지수적으로 감쇠한다.
 *
 * @param ageHours 각 댓글의 "지금으로부터 경과 시간(시간)" 배열
 * @returns decay 가중 빈도 합 (>= 0)
 */
export function decayWeightedFrequency(ageHours: number[]): number {
  return ageHours.reduce((sum, age) => {
    const steps = Math.max(0, age) / DECAY_STEP_HOURS;
    const weight = Math.pow(DECAY_LAMBDA, steps);
    return sum + weight;
  }, 0);
}

// ---------------------------------------------------------------------------
// L2-b 감정 분산 (SentimentVariance)
// ---------------------------------------------------------------------------

/**
 * 감정 라벨 분포의 분산(논쟁도) → 0~1.
 *
 * pos/neg/neu 를 각각 +1 / -1 / 0 점수로 매핑한 뒤 모분산을 구한다.
 * 분산이 클수록(긍·부가 팽팽) "뜨거운" 논쟁으로 본다.
 * 가능한 최대 분산은 pos/neg 가 반반일 때 1.0 → 그대로 0~1 스케일.
 */
export function sentimentVariance(sentiments: Sentiment[]): number {
  if (sentiments.length === 0) return 0;

  const score = (s: Sentiment): number =>
    s === "pos" ? 1 : s === "neg" ? -1 : 0;

  const values = sentiments.map(score);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;

  // 이론적 최대 분산 = 1 (pos/neg 5:5). 안전하게 클램프.
  return clamp01(variance);
}

// ---------------------------------------------------------------------------
// L2-c 토픽 집중도 (TopicConcentration)
// ---------------------------------------------------------------------------

/**
 * 토픽(키워드) 집중도 → 0~1. Herfindahl-Hirschman Index(HHI) 기반.
 *
 * 키워드별 등장 횟수의 점유율 제곱 합. 한 토픽에 쏠릴수록 1 에 가깝고,
 * 여러 토픽으로 분산되면 0 에 가깝다. 이슈가 "한 주제로 결집"했는지 측정.
 *
 * @param keywordCounts 키워드별 등장 횟수
 */
export function topicConcentration(keywordCounts: number[]): number {
  const total = keywordCounts.reduce((a, b) => a + Math.max(0, b), 0);
  if (total <= 0) return 0;

  const hhi = keywordCounts.reduce((sum, c) => {
    const share = Math.max(0, c) / total;
    return sum + share * share;
  }, 0);

  return clamp01(hhi);
}

// ---------------------------------------------------------------------------
// L3 온도 산출 (정규화된 성분 → 최종 온도)
// ---------------------------------------------------------------------------

/** 정규화 완료된(0~1) 온도 성분 */
export interface NormalizedComponents {
  /** Freq_norm */
  frequency: number;
  /** SentVar_norm */
  sentimentVar: number;
  /** TopicConc_norm */
  topicConc: number;
}

/**
 * temperature = 100 * (0.4*Freq_norm + 0.35*SentVar_norm + 0.25*TopicConc_norm)
 * 입력은 0~1 로 정규화된 성분이어야 한다. 결과는 0~100.
 */
export function computeTemperature(c: NormalizedComponents): number {
  const weighted =
    ALPHA * clamp01(c.frequency) +
    BETA * clamp01(c.sentimentVar) +
    GAMMA * clamp01(c.topicConc);
  return clamp01to100(TEMP_MAX * weighted);
}

/** 소수 1자리 반올림 (저장·표시 일관성용) */
export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
