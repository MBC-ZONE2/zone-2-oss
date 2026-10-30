// ============================================================================
// lib/ai — AI 함수 래퍼 (Phase 0 스텁)
//
// 시그니처 출처: docs/06-API명세.md §7
// 함수별 파일로 분리하고 여기서 모두 re-export 한다.
// 모든 호출은 Cloudflare AI Gateway(lib/ai/gateway) 경유.
// 키 부재/AI_MOCK=1 이면 각 함수가 결정적 mock 을 반환하고, 그 외엔 실제 호출.
// ============================================================================

export { embed } from "./embed";
export { rerankMatches } from "./rerank";
export { summarizeCrossview } from "./summarize";
export { classifySentiment, classifySentimentDetailed } from "./sentiment";
export type { SentimentBatchResult, SentimentProvider } from "./sentiment";
export { generatePodcastScript, toKoreanDate } from "./podcast";
export type { PodcastInput } from "./podcast";
export { synthesizeSpeech } from "./tts";
export { moderateContent } from "./moderate";

// AI Gateway 경유 클라이언트 팩토리 / 설정
export {
  getAnthropic,
  getOpenAI,
  getGatewayConfig,
  callGateway,
  CLAUDE_MODEL,
  CLAUDE_FAST_MODEL,
  OPENAI_EMBEDDING_MODEL,
  OPENAI_TTS_MODEL,
} from "./gateway";
export type {
  AiProvider,
  GatewayConfig,
  GatewayRequest,
} from "./gateway";
