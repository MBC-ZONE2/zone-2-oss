// ============================================================================
// lib/temperature — 공론 온도계 (기능 ②)
//
// 산출: comments 감정(classifySentiment) + Postgres 집계
//   temperature = 100 * (0.4*Freq_norm + 0.35*SentVar_norm + 0.25*TopicConc_norm)
//   시간가중 decay λ=0.95 → temperature_scores + temperature_runs 기록
//
// 공개 진입점만 re-export 한다.
// ============================================================================

// 산출 (Cron/서버)
export { runTemperatureComputation } from "./compute";

// 읽기 쿼리 (공개 API)
export { getTemperatureBoard, getIssueTrend, TOP_N } from "./board";

// 색상 구간 / 수식 상수 (UI·검증 공용)
export {
  TEMPERATURE_BANDS,
  bandForTemperature,
  ALPHA,
  BETA,
  GAMMA,
  DECAY_LAMBDA,
} from "./formula";
export type { TemperatureBand } from "./formula";

// 산출 결과 타입
export type { ComputeRunResult } from "./types";
