// ============================================================================
// lib/podcast — AI 팟캐스트 모듈 배럴
//
// 담당(그룹 C): 수집 → Claude 스크립트 → 금칙어 QA → TTS →
//               R2 업로드(placeholder) → podcast_episodes(review) → 관리자 대시보드 큐.
// ============================================================================

export { generateEpisode } from "./generate";
export { collectSources } from "./collect";
export { checkPodcastDay, PODCAST_MISSING_KIND, PODCAST_PENDING_KIND, type PodcastHealth } from "./health";
export {
  listPublishedEpisodes,
  getPublishedEpisode,
  type EpisodeListResult,
} from "./queries";
export { rowToEpisode, rowsToEpisodes } from "./mappers";
export {
  episodeTeaser,
  episodeLead,
  episodeHeadline,
  episodeDisplayHeadline,
  type EpisodeTeaser,
} from "./script";
export {
  checkBannedWords,
  maskBannedWords,
  DEFAULT_BANNED_WORDS,
} from "./banned-words";
export {
  uploadAudio,
  resolveDurationSec,
  estimateDurationSec,
  AudioUploadError,
  type UploadResult,
} from "./storage";
export type {
  EpisodeRow,
  CollectedSources,
  QaResult,
  GenerateOptions,
  GenerateResult,
} from "./types";
