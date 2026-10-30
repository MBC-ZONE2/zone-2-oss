// ============================================================================
// MbcYoutubeAdapter — MBC충북 유튜브 수집 어댑터 (YouTube Data API v3)
//
// 광역(macro) 측 입력 중 "방송 영상" 경로. 영상 메타를 기사처럼 적재하고
// (kind='youtube'), 영상 댓글을 감정분석 → 공론온도계 입력으로 넘긴다.
//
// [쿼터 설계] 기본 할당량 10,000 units/day 를 아끼기 위해 search.list(100 units)
//   를 쓰지 않는다. 대신 uploads 재생목록을 경유한다:
//     channels.list(1) → playlistItems.list(1/page) → commentThreads.list(1/page)
//   영상 50건 + 각 댓글 1페이지 ≈ 52 units 로 1회 수집이 끝난다.
//
// [키 없이 동작] YOUTUBE_API_KEY 또는 MBC_YOUTUBE_CHANNEL_ID 가 없으면 빈 배열을
//   반환한다(throw 금지). DemoAdapter 와 함께 등록돼도 파이프라인이 깨지지 않는다.
//
// [저작권] 영상 본문(body)에는 설명문(description)만 담는다. 자막·대본은 수집하지
//   않는다. 댓글 작성자는 Core 가 즉시 해시화한다(lib/ingest/hash).
// ============================================================================

import { region } from "@/config/region";
import type {
  MediaSourceAdapter,
  RawArticle,
  RawComment,
} from "./types";

const API_BASE = "https://www.googleapis.com/youtube/v3";

/** external_id 접두사 — fetchComments 가 videoId 를 역산하는 규칙 */
const ID_PREFIX = "yt-";

/** 1회 수집 상한 (쿼터·적재량 보호) */
const MAX_VIDEO_PAGES = 4; // 50건/page → 최대 200건
const MAX_COMMENT_PAGES = 2; // 100건/page → 영상당 최대 200건

/**
 * 수집 주기(시간). deliverables/04 §4 는 "YouTube 댓글 = 6시간"으로 못박는다.
 *
 * 그런데 레지스트리는 1시간 주기 /api/cron/ingest 가 순회한다. 매 시간 돌면
 * 1회 최대 405 units(채널 1 + 영상 4페이지 + 영상 200건×댓글 2페이지)라
 * 하루 9,720 units 로 기본 할당량 10,000 을 거의 다 쓴다 — 재시도·검증 여유가 없다.
 *
 * 그래서 어댑터가 스스로 시각을 보고 6시간 배수에만 수집한다(0·6·12·18시 KST).
 * 별도 크론을 두면 더 깔끔하지만 인프라 변경이 필요해 여기서 게이트한다.
 */
const INGEST_INTERVAL_HOURS = 6;

/** KST 기준 현재 시각이 수집 슬롯인지 */
function isIngestSlot(now: Date): boolean {
  const kstHour = new Date(now.getTime() + 9 * 60 * 60 * 1000).getUTCHours();
  return kstHour % INGEST_INTERVAL_HOURS === 0;
}

/** 영상 하나의 external_id */
function videoExternalId(videoId: string): string {
  return `${ID_PREFIX}${videoId}`;
}

/** external_id → videoId 역산 (규칙 위반 시 null) */
function parseVideoId(articleRef: string): string | null {
  return articleRef.startsWith(ID_PREFIX)
    ? articleRef.slice(ID_PREFIX.length)
    : null;
}

// ---------------------------------------------------------------------------
// API 호출 헬퍼
// ---------------------------------------------------------------------------

interface YoutubeConfig {
  apiKey: string;
  channelId: string;
}

/** 환경변수 해석 — 미설정이면 null(수집 생략, 실패 아님) */
function resolveConfig(): YoutubeConfig | null {
  const apiKey = process.env.YOUTUBE_API_KEY?.trim();
  const channelId = process.env.MBC_YOUTUBE_CHANNEL_ID?.trim();
  if (!apiKey || !channelId) return null;
  return { apiKey, channelId };
}

/**
 * YouTube API GET 요청. 2xx 가 아니면 reason 을 담아 throw 한다.
 * 호출자가 reason 으로 "정상적인 빈 결과"(댓글 비활성 등)를 구분한다.
 */
async function apiGet(
  path: string,
  params: Record<string, string>,
): Promise<Record<string, unknown>> {
  const url = new URL(`${API_BASE}/${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url, { cache: "no-store" });
  const payload = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;

  if (!response.ok) {
    throw new YoutubeApiError(
      `YouTube API ${path} 실패 (HTTP ${response.status})`,
      extractReason(payload),
    );
  }
  return payload;
}

/** API 오류 reason 코드를 보존하는 에러 */
class YoutubeApiError extends Error {
  constructor(
    message: string,
    readonly reason: string | null,
  ) {
    super(reason ? `${message}: ${reason}` : message);
    this.name = "YoutubeApiError";
  }
}

/** 오류 응답에서 첫 reason 코드를 뽑는다 */
function extractReason(payload: Record<string, unknown>): string | null {
  const error = payload.error as { errors?: Array<{ reason?: string }> } | undefined;
  return error?.errors?.[0]?.reason ?? null;
}

// ---------------------------------------------------------------------------
// 기사(영상) 수집
// ---------------------------------------------------------------------------

/** 채널의 uploads 재생목록 ID 조회 */
async function fetchUploadsPlaylistId(config: YoutubeConfig): Promise<string | null> {
  const payload = await apiGet("channels", {
    part: "contentDetails",
    id: config.channelId,
    key: config.apiKey,
  });

  const items = payload.items as
    | Array<{ contentDetails?: { relatedPlaylists?: { uploads?: string } } }>
    | undefined;
  return items?.[0]?.contentDetails?.relatedPlaylists?.uploads ?? null;
}

interface PlaylistItem {
  snippet?: {
    title?: string;
    description?: string;
    publishedAt?: string;
    resourceId?: { videoId?: string };
    thumbnails?: Record<string, { url?: string }>;
  };
  contentDetails?: { videoId?: string; videoPublishedAt?: string };
}

/** playlistItem → RawArticle (필수 필드 누락 시 null) */
function toRawArticle(item: PlaylistItem): RawArticle | null {
  const videoId = item.contentDetails?.videoId ?? item.snippet?.resourceId?.videoId;
  const title = item.snippet?.title?.trim();
  if (!videoId || !title) return null;

  // 재생목록 추가 시각(snippet.publishedAt)이 아니라 영상 실제 공개 시각을 쓴다.
  const publishedAt =
    item.contentDetails?.videoPublishedAt ?? item.snippet?.publishedAt;
  if (!publishedAt) return null;

  return {
    externalId: videoExternalId(videoId),
    url: `https://www.youtube.com/watch?v=${videoId}`,
    title,
    // 자막·대본은 수집하지 않는다 — 설명문만.
    body: item.snippet?.description?.trim() ?? "",
    publishedAt,
    kind: "youtube",
    raw: {
      kind: "youtube",
      outlet: region.outlets.macro.name,
      videoId,
      thumbnail: item.snippet?.thumbnails?.high?.url ?? null,
    },
  };
}

/**
 * uploads 재생목록을 최신순으로 훑어 since 이후 영상만 모은다.
 * 재생목록이 역시간순이므로 since 이전이 나오면 조기 종료한다.
 */
async function fetchVideos(
  config: YoutubeConfig,
  playlistId: string,
  since: Date,
): Promise<RawArticle[]> {
  const articles: RawArticle[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < MAX_VIDEO_PAGES; page += 1) {
    const payload = await apiGet("playlistItems", {
      part: "snippet,contentDetails",
      playlistId,
      maxResults: "50",
      key: config.apiKey,
      ...(pageToken ? { pageToken } : {}),
    });

    const items = (payload.items as PlaylistItem[] | undefined) ?? [];
    for (const item of items) {
      const article = toRawArticle(item);
      if (!article) continue;
      // 역시간순 → since 이전 영상을 만나면 이후는 볼 필요 없다
      if (new Date(article.publishedAt).getTime() < since.getTime()) {
        return articles;
      }
      articles.push(article);
    }

    pageToken = payload.nextPageToken as string | undefined;
    if (!pageToken) break;
  }

  return articles;
}

// ---------------------------------------------------------------------------
// 댓글 수집
// ---------------------------------------------------------------------------

interface CommentThread {
  snippet?: {
    topLevelComment?: {
      id?: string;
      snippet?: {
        textOriginal?: string;
        authorChannelId?: { value?: string };
        likeCount?: number;
        publishedAt?: string;
      };
    };
  };
}

/** commentThread → RawComment (필수 필드 누락 시 null) */
function toRawComment(thread: CommentThread, articleRef: string): RawComment | null {
  const top = thread.snippet?.topLevelComment;
  const snippet = top?.snippet;
  const body = snippet?.textOriginal?.trim();
  if (!top?.id || !body) return null;

  return {
    externalId: top.id,
    articleRef,
    body,
    // 채널 ID(원본)는 Core 가 즉시 해시화한다 — 여기서 저장하지 않는다.
    authorRaw: snippet?.authorChannelId?.value,
    likeCount: snippet?.likeCount ?? 0,
    publishedAt: snippet?.publishedAt ?? new Date().toISOString(),
  };
}

/**
 * 영상 댓글 수집. 댓글이 꺼져 있거나 영상이 삭제된 경우는 정상적인 빈 결과로
 * 처리한다(throw 하면 ingest 가 경고를 쌓기만 하고 의미가 없다).
 */
async function fetchVideoComments(
  config: YoutubeConfig,
  videoId: string,
  articleRef: string,
): Promise<RawComment[]> {
  const comments: RawComment[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < MAX_COMMENT_PAGES; page += 1) {
    let payload: Record<string, unknown>;
    try {
      payload = await apiGet("commentThreads", {
        part: "snippet",
        videoId,
        maxResults: "100",
        order: "relevance",
        key: config.apiKey,
        ...(pageToken ? { pageToken } : {}),
      });
    } catch (error) {
      if (error instanceof YoutubeApiError && isEmptyResultReason(error.reason)) {
        return comments;
      }
      throw error;
    }

    const threads = (payload.items as CommentThread[] | undefined) ?? [];
    for (const thread of threads) {
      const comment = toRawComment(thread, articleRef);
      if (comment) comments.push(comment);
    }

    pageToken = payload.nextPageToken as string | undefined;
    if (!pageToken) break;
  }

  return comments;
}

/** 댓글이 "없는 게 정상"인 오류 reason 인지 */
function isEmptyResultReason(reason: string | null): boolean {
  return (
    reason === "commentsDisabled" ||
    reason === "videoNotFound" ||
    reason === "forbidden"
  );
}

// ---------------------------------------------------------------------------
// 어댑터
// ---------------------------------------------------------------------------

/**
 * MBC충북 유튜브 어댑터.
 * id 'mbc_cb' 는 media_source enum 과 같아 resolveSource 가 그대로 쓴다.
 */
export const MbcYoutubeAdapter: MediaSourceAdapter = {
  id: "mbc_cb",
  tier: "macro",

  async fetchArticles(since: Date): Promise<RawArticle[]> {
    const config = resolveConfig();
    if (!config) return []; // 키·채널 미설정 — 수집 생략(정상)

    // 6시간 주기 게이트. 수동 실행·검증은 YOUTUBE_INGEST_FORCE=1 로 우회한다.
    if (process.env.YOUTUBE_INGEST_FORCE !== "1" && !isIngestSlot(new Date())) {
      return [];
    }

    const playlistId = await fetchUploadsPlaylistId(config);
    if (!playlistId) return [];

    return fetchVideos(config, playlistId, since);
  },

  async fetchComments(articleRef: string): Promise<RawComment[]> {
    const config = resolveConfig();
    if (!config) return [];

    const videoId = parseVideoId(articleRef);
    if (!videoId) return []; // 이 어댑터가 적재한 기사가 아님

    return fetchVideoComments(config, videoId, articleRef);
  },
};
