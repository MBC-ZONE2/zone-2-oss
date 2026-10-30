// ============================================================================
// lib/matching/types — 크로스뷰 매칭 내부 타입
//
// 공통 도메인 타입(types/index.ts)에 없는, 매칭 모듈 내부에서만 쓰는 타입을
// 여기에 정의한다. (공유 타입은 절대 수정하지 않는다)
// ============================================================================

import type { Article, CrossviewCardData } from "@/types";

/** 매칭 파이프라인 튜닝 파라미터 (deliverables/01 §4 처리 로직 기준) */
export interface MatchOptions {
  /** pgvector 코사인 후보 개수 (Top-N) — 기본 10 */
  topN: number;
  /** 발행일 허용 범위 (일) — 기본 ±7일 */
  publishedWithinDays: number;
  /** 재랭킹 점수 임계값. 미만은 candidate 보관, 게시 제외 — 기본 0.6 */
  scoreThreshold: number;
  /** 최종 확정 페어 상한 (상위 N건) — 기본 5 */
  maxPairs: number;
  /** 신규 기사 조회 기준: 최근 N시간 내 생성분 — 기본 24 */
  lookbackHours: number;
  /**
   * 1회 실행에서 처리할 기사 상한 — 기본 60.
   *
   * 기사 1건당 재랭킹 1회 + 확정 페어마다 요약이 붙어 AI 호출이 곱해진다.
   * 초기 백필처럼 수백 건이 한 번에 들어오면 한 요청에서 수천 번을 호출해
   * 크론 타임아웃과 큰 일회성 비용을 낸다. 남은 기사는 다음 실행이 이어받는다
   * (조회가 created_at 내림차순이라 최신부터 처리된다).
   */
  maxArticlesPerRun: number;
}

/** MatchOptions 기본값 (크로스뷰 기능 정의서 §4) */
export const DEFAULT_MATCH_OPTIONS: MatchOptions = {
  topN: 10,
  publishedWithinDays: 7,
  scoreThreshold: 0.6,
  maxPairs: 5,
  lookbackHours: 24,
  maxArticlesPerRun: 60,
};

/**
 * pgvector 후보 1건.
 * 코사인 유사도(0~1, 1이 가장 유사)와 후보 기사를 함께 담는다.
 */
export interface MatchCandidate {
  article: Article;
  /** 코사인 유사도 (0~1) */
  similarity: number;
}

/**
 * 한 기준 기사에 대한 매칭 결과 1건.
 * rerank 점수 + 요약 + 카드데이터까지 합쳐진 최종 페어 후보.
 */
export interface MatchResult {
  /** 광역(macro) 기사 id */
  articleMacro: string;
  /** 기초(micro) 기사 id */
  articleMicro: string;
  similarity: number;
  /** Claude 재랭킹 점수 (0~1) */
  matchScore: number;
  summaryMacro: string;
  summaryMicro: string;
  readingPoint: string;
  cardData: CrossviewCardData;
}

/** 매칭 실행 요약 (cron 응답·로깅용) */
export interface MatchRunSummary {
  /** 매칭 시도한 신규 기사 수 */
  processedArticles: number;
  /** 새로 저장(upsert)된 페어 수 */
  createdPairs: number;
  /** 임계값 미만이라 게시 제외(candidate 보관)된 페어 수 */
  belowThreshold: number;
  /** 후보가 없어 건너뛴 기사 수 */
  skippedNoCandidate: number;
  /** 같은 story(제목이 같은 MBC 뉴스+유튜브)로 이미 페어가 있어 뺀 후보 수 (#188) */
  skippedDuplicateStory: number;
}
