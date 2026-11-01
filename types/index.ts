// ============================================================================
// ZONE-2 공통 도메인 타입 (병렬 개발의 계약)
//
// 출처: docs/04-데이터모델.md (DB 스키마) + docs/06-API명세.md (응답 타입)
// 규칙: DB는 snake_case, 애플리케이션 경계에서는 camelCase 로 노출한다.
//       모든 timestamp 는 UTC ISO-8601 문자열.
// ============================================================================

// ---------------------------------------------------------------------------
// Enum / 리터럴 유니온 (docs/04 의 Postgres enum 대응)
// ---------------------------------------------------------------------------

/** 매체 구분 — 광역(MBC충북) / 기초(옥천신문) */
export type MediaSource = "mbc_cb" | "okinews";

/** 기사 종류 */
export type ArticleKind = "news" | "youtube" | "forum_opinion";

/** 댓글 감정 분류 (Claude) */
export type Sentiment = "pos" | "neg" | "neu";

/** 크로스뷰 페어 상태 */
export type PairStatus = "candidate" | "approved" | "rejected";

/** 팟캐스트 에피소드 상태 */
export type EpisodeStatus =
  | "generating"
  | "review"
  | "approved"
  | "published"
  | "failed";

/** 모더레이션 대상 종류 */
export type ModerationTarget = "crossview" | "podcast" | "temperature" | "forum";

/** 모더레이션 액션 — edit_approve: 인라인 수정 후 승인 (F7) */
export type ModerationAction = "approve" | "reject" | "edit_approve" | "auto_publish" | "cleanup";

// ---------------------------------------------------------------------------
// 기사 / 댓글
// ---------------------------------------------------------------------------

/** 기사 (articles) */
export interface Article {
  id: string;
  source: MediaSource;
  kind: ArticleKind;
  externalId: string | null;
  url: string | null;
  title: string;
  body: string | null;
  category: string | null;
  keywords: string[] | null;
  publishedAt: string | null;
  /** text-embedding-3-small (1536차원). API 응답에는 보통 미포함. */
  embedding: number[] | null;
  /** 원본 페이로드 (정규화 전 raw) */
  raw: unknown;
  /**
   * 원본 매체가 제공한 기사 사진 URL (raw.imageUrl 을 정규화한 값).
   * 회의 결정 [3] — 기사 이미지는 옥천신문/MBC충북 원본을 우선하고 AI 생성 이미지는 보완용.
   * 유튜브 기사(kind=youtube)와 비 https URL 은 null 로 떨어진다. 공개 select 에만 실려 온다.
   */
  imageUrl?: string | null;
  createdAt: string;
}

/** 댓글 (comments) */
export interface Comment {
  id: string;
  source: MediaSource;
  articleId: string | null;
  externalId: string | null;
  body: string;
  /** 비식별화된 작성자 해시 */
  authorHash: string | null;
  likeCount: number;
  sentiment: Sentiment | null;
  publishedAt: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// 기능 ① 크로스뷰 매칭
// ---------------------------------------------------------------------------

/** 카드뉴스 구성 데이터 (crossview_pairs.card_data) — 구조는 그룹 A에서 확정 */
export interface CrossviewCardData {
  [key: string]: unknown;
}

/** 크로스뷰 페어 (crossview_pairs) */
export interface CrossviewPair {
  id: string;
  /** 광역(MBC충북) 기사 id */
  articleMacro: string | null;
  /** 기초(옥천신문) 기사 id */
  articleMicro: string | null;
  /** pgvector 코사인 유사도 */
  similarity: number | null;
  /** Claude 재랭킹 점수 (0~1) */
  matchScore: number | null;
  /** AI 광역 관점 요약 */
  summaryMacro: string | null;
  /** AI 기초 관점 요약 */
  summaryMicro: string | null;
  /** "같은 정책, 두 개의 현실" 식 리딩 포인트 */
  readingPoint: string | null;
  cardData: CrossviewCardData | null;
  /** AI 생성 에디토리얼 일러스트(카드뉴스 배경) 공개 URL */
  cardImageUrl?: string | null;
  /** AI 생성 짧은 대조 헤드라인(히어로용) */
  cardHeadline?: string | null;
  status: PairStatus;
  createdAt: string;
  /** 최초 공개(승인) 시각 — 0030 트리거. 뉴스 사이트맵·NewsArticle.datePublished 기준. 미승인이면 null */
  publishedAt?: string | null;
}

// ---------------------------------------------------------------------------
// 기능 ② 공론 온도계
// ---------------------------------------------------------------------------

/** 이슈 (issues) */
export interface Issue {
  id: string;
  /** LLM 라벨 */
  label: string;
  keywords: string[] | null;
  createdAt: string;
}

/**
 * 온도 점수 (temperature_scores)
 * temperature = 100 * (0.4*Freq_norm + 0.35*SentVar_norm + 0.25*TopicConc_norm)
 */
export interface TemperatureScore {
  id: string;
  issueId: string | null;
  /** 0~100 스케일 */
  temperature: number;
  /** Freq 성분 */
  frequency: number | null;
  /** SentimentVariance 성분 */
  sentimentVar: number | null;
  /** TopicConcentration 성분 */
  topicConc: number | null;
  /** TOP5 순위 */
  rank: number | null;
  /** 직전 순위 (변동 화살표용) */
  prevRank: number | null;
  computedAt: string;
}

/** 온도 추이 한 점 — GET /api/temperature/[issueId] 응답 요소 */
export interface TemperaturePoint {
  temperature: number;
  computedAt: string;
}

/** 현재 TOP5 보드 — GET /api/temperature 응답 (issue 정보 조인) */
export interface TemperatureBoardItem extends TemperatureScore {
  issue: Issue | null;
}

/** 온도계 보드 — GET /api/temperature 응답 */
export interface TemperatureBoard {
  items: TemperatureBoardItem[];
  /** 보드 산출 시각 (가장 최근 computed_at) */
  computedAt: string;
}

// ---------------------------------------------------------------------------
// 기능 ③ AI 팟캐스트
// ---------------------------------------------------------------------------

/** 에피소드가 참조한 소스 (podcast_episodes.source_refs) */
export interface EpisodeSourceRefs {
  /** 사용된 기사 id 목록 */
  articleIds?: string[];
  /** 사용된 댓글 id 목록 */
  commentIds?: string[];
  [key: string]: unknown;
}

/** 팟캐스트 에피소드 (podcast_episodes) */
export interface Episode {
  id: string;
  /** "오늘의 충북 N월 N일" — 회차 식별용. 화면 제목은 headline 이 우선 */
  title: string;
  /** 내용 요약 헤드라인(codex, 40자 이내). null 이면 대본 휴리스틱으로 폴백(0020) */
  headline: string | null;
  /** Claude 생성 스크립트 */
  script: string | null;
  /** 오디오 URL (Supabase Storage / R2) */
  audioUrl: string | null;
  durationSec: number | null;
  thumbnailUrl: string | null;
  sourceRefs: EpisodeSourceRefs | null;
  status: EpisodeStatus;
  /** 검수 운영자 id */
  reviewedBy: string | null;
  /** 발행 예정일 (월/수/금) */
  scheduledFor: string | null;
  publishedAt: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// 기능 ④ 통합 공론장
// ---------------------------------------------------------------------------

/** 게시글 (forum_posts) */
export interface ForumPost {
  id: string;
  articleId: string | null;
  authorHash: string | null;
  /** 실명(소셜 닉네임) 선택 시에만 값 존재. null = 익명 (F6) */
  displayName: string | null;
  title: string | null;
  body: string;
  /** 첨부 사진 1장(공개 URL). 없거나 가려진 글이면 null (2026-10-19) */
  imageUrl: string | null;
  likeCount: number;
  /** 보이는 댓글 수(삭제·가려진 댓글 제외). 목록·상세 공용, 2026-10-20 */
  commentCount: number;
  /** AI 모더레이션 플래그 */
  isFlagged: boolean;
  /** bot / spam / hate / report */
  flagReason: string | null;
  /** 소프트 삭제 시각(ISO). null = 미삭제 (F6) */
  deletedAt: string | null;
  createdAt: string;
}

/** 게시글 댓글 (forum_comments) */
export interface ForumComment {
  id: string;
  postId: string | null;
  authorHash: string | null;
  /** 실명(소셜 닉네임) 선택 시에만 값 존재. null = 익명 (F6) */
  displayName: string | null;
  body: string;
  /** 좋아요 수 (forum_reactions 집계, F6) */
  likeCount: number;
  isFlagged: boolean;
  /** 소프트 삭제 시각(ISO). null = 미삭제 (F6) */
  deletedAt: string | null;
  createdAt: string;
}

/** 게시글 + 댓글 — GET /api/forum/[id] 응답 */
export interface ForumPostDetail extends ForumPost {
  comments: ForumComment[];
}

// ---------------------------------------------------------------------------
// 기능 ⑤ 관리자 / 검수
// ---------------------------------------------------------------------------

/** 모더레이션 로그 (moderation_logs) */
export interface ModerationLog {
  id: string;
  target: ModerationTarget;
  targetId: string;
  action: ModerationAction;
  reason: string | null;
  /** 구조화 기록 — 수정승인 before/after, 롤백 사유·전이 등 (F7) */
  details: Record<string, unknown> | null;
  /** MBC/옥천 담당자 id */
  operator: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// 공통 API 응답 규약 (docs/06 §2)
// ---------------------------------------------------------------------------

/** 에러 페이로드 */
export interface ApiError {
  code: string;
  message: string;
}

/** 표준 응답 — 성공 시 error: null */
export type ApiResponse<T> =
  | { data: T; error: null }
  | { data: null; error: ApiError };

/** cursor 기반 페이지네이션 파라미터 (기본 limit 20) */
export interface PaginationParams {
  cursor?: string;
  limit?: number;
}
