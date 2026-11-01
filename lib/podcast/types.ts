// ============================================================================
// lib/podcast/types — AI 팟캐스트 내부 타입
//
// 공통 도메인 타입(Episode 등)은 @/types 를 사용한다.
// 여기서는 팟캐스트 파이프라인 내부에서만 쓰는 보조 타입을 정의한다.
// (types/index.ts 는 공유 파일이라 수정하지 않는다 — 필요한 타입은 여기서 정의)
// ============================================================================

import type { Comment } from "@/types";

/** podcast_episodes 테이블 row (snake_case, DB 원형) */
export interface EpisodeRow {
  id: string;
  title: string;
  headline: string | null;
  script: string | null;
  audio_url: string | null;
  duration_sec: number | null;
  thumbnail_url: string | null;
  source_refs: unknown;
  status: string;
  reviewed_by: string | null;
  scheduled_for: string | null;
  published_at: string | null;
  created_at: string;
}

/** 수집 단계 결과 — generatePodcastScript 입력 + source_refs 구성에 사용 */
export interface CollectedSources {
  /** 투입 기사 — 크로스뷰 쌍 → 옥천신문 → MBC충북 순(#166: 매체별 몫 보장) */
  articles: import("@/types").Article[];
  /** 인기 댓글 TOP N (좋아요순) */
  comments: Comment[];
  /** 승인 크로스뷰 쌍(광역 id·기초 id) — 대본에서 첫 사안으로, 쌍 번호대로 대비해 다룬다(③) */
  pairs: { macroId: string; microId: string }[];
  /** 옥천신문 몫(뉴스·여론광장) 건수 — 0 이면 "오늘의 옥천" 코너는 공고 마감으로 채운다 */
  okinewsCount: number;
  /** 옥천 소식이 없는 날 코너를 채울 군청 공고 마감(7일 안) */
  okNotices: { title: string; deadline: string }[];
}

/** collectSources 옵션 — 매체별 창·건수. 기본값은 #166 권고(옥천 7일/6건, MBC 24h/14건) */
export interface CollectOptions {
  /** MBC충북 수집 창(시간). 기본 24 — 크론은 72(주말 무데이터 보정) */
  mbcHours?: number;
  /** MBC충북 건수 상한. 기본 14 */
  mbcLimit?: number;
  /** 옥천신문 수집 창(일). 기본 7(주간지 보정) */
  okinewsDays?: number;
  /** 옥천신문 건수 상한. 기본 6 */
  okinewsLimit?: number;
  /** 인기 댓글 상위 N. 기본 10 */
  topComments?: number;
  /** 직전 회차에 이미 투입한 기사 id — 옥천 몫에서 뒤로 미룬다(같은 기사 며칠째 반복 완화) */
  excludeIds?: string[];
}

/** 금칙어 QA 결과 */
export interface QaResult {
  /** 통과 여부 (금칙어 미검출) */
  ok: boolean;
  /** 검출된 금칙어 목록 (중복 제거) */
  hits: string[];
}

/** 파이프라인 실행 옵션 */
export interface GenerateOptions {
  /** 대상 날짜 (KST 기준 "YYYY-MM-DD"). 미지정 시 오늘. */
  date?: string;
  /** 수집 기준 시간(시간 단위). 기본 24h. */
  lookbackHours?: number;
  /** 인기 댓글 상위 N개. 기본 10. */
  topComments?: number;
  /**
   * 같은 날짜 에피소드가 이미 있어도 강제로 다시 생성한다(기본 false).
   * 백필·재생성처럼 의도적으로 덮어써야 할 때만 쓴다.
   */
  force?: boolean;
}

/** 파이프라인 실행 결과 요약 */
export interface GenerateResult {
  episodeId: string;
  title: string;
  status: string;
  /** QA 에서 검출된 금칙어 (있으면 마스킹 처리됨) */
  qaHits: string[];
  articleCount: number;
  commentCount: number;
}
