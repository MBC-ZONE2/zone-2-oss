// ============================================================================
// lib/temperature/types — 온도 산출 파이프라인 내부 타입
//
// 공용 도메인 타입(types/index.ts)에 없는 "산출 과정"의 중간 표현만 정의한다.
// (types/index.ts 는 공유·수정 금지 파일이므로 모듈 내부에 둔다.)
// ============================================================================

import type { Sentiment } from "@/types";
import type { SentimentProvider } from "@/lib/ai/sentiment";

/** 이슈에 연결된 댓글 1건의 산출용 표현 */
export interface IssueComment {
  /** comments.id — 분류 결과를 되써 넣기 위해(공론장 글은 null) */
  id?: string | null;
  /** 본문 (감정 분류 입력) */
  body: string;
  /** 작성 시각 (ISO-8601) — decay 계산 입력 */
  publishedAt: string | null;
  /** 이미 분류된 감정 (없으면 classifySentiment 로 채운다) */
  sentiment: Sentiment | null;
}

/** 산출 직전, 이슈 1건의 입력 묶음 */
export interface IssueInput {
  issueId: string;
  /** 이슈 키워드 (토픽 집중도 계산에 사용) */
  keywords: string[];
  /** 이슈에 연결된 댓글들 */
  comments: IssueComment[];
}

/** 이슈 1건의 원시(raw, 정규화 전) 성분 */
export interface RawComponents {
  issueId: string;
  /** decay 가중 빈도 (정규화 전, >= 0) */
  rawFrequency: number;
  /** 감정 분산 0~1 (이미 0~1 스케일이라 추가 정규화 불필요) */
  sentimentVar: number;
  /** 토픽 집중도 0~1 (이미 0~1 스케일) */
  topicConc: number;
}

/** 정규화 + 온도 산출이 끝난 이슈 1건의 결과 */
export interface ScoredIssue {
  issueId: string;
  temperature: number;
  /** 저장용 성분 — temperature_scores.frequency/sentiment_var/topic_conc */
  frequency: number;
  sentimentVar: number;
  topicConc: number;
}

/** temperature_scores 에 insert 할 행 (snake_case, DB 컬럼명과 일치) */
export interface TemperatureScoreInsert {
  issue_id: string;
  temperature: number;
  frequency: number;
  sentiment_var: number;
  topic_conc: number;
  rank: number;
  prev_rank: number | null;
  computed_at: string;
}

/** fillSentiments 통계 — 분류가 실제로 몇 건을, 어느 경로로 처리했는지 */
export interface SentimentFillStats {
  /** 분류가 필요했던(sentiment=null) 여론 수 */
  pending: number;
  /** 모델이 실제로 라벨을 낸 수 (= pending − fallback) */
  classified: number;
  provider: SentimentProvider | null;
  /** 순번 누락으로 중립으로 메운 수 */
  fallback: number;
  /** 로컬 모델이 켜져 있는데 실패했는지 */
  localFailed: boolean;
}

/** 산출 1회 입력 통계 — temperature_runs.stats 에 그대로 저장(0022_metrics) */
export interface RunStats extends SentimentFillStats {
  /** 산출 이슈 수 */
  issues: number;
  /** 이슈에 매칭된 여론 수(한 여론이 여러 이슈에 들어가면 중복 집계) */
  matched: number;
  /** 매칭 여론이 1건 이상인 이슈 수 */
  issuesWithOpinions: number;
  /** 이슈에 연결된 지역 기사 수(중복 포함) — #183 기사 경유 연결 */
  linkedArticles: number;
  /** 여론 풀 크기(지역 기사 댓글 + 공론장 글) */
  pool: number;
  /** 이번 실행에서 comments.sentiment 에 되써 넣은 수 */
  persisted: number;
}

/** 산출 1회 실행 결과 요약 (호출자/응답용) */
export interface ComputeRunResult {
  status: "ok" | "fail";
  detail: string;
  /** 산출된 이슈 수 */
  issueCount: number;
  /** 산출 시각 (ISO-8601) */
  computedAt: string;
  /** 입력 통계(성공 시) */
  stats?: RunStats;
}
