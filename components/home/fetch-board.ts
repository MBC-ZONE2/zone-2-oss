// ============================================================================
// components/home/fetch-board — 홈 라이브 보드 데이터 페칭 (서버 전용)
//
// 홈(데이터 일간지 1면)은 서버 컴포넌트에서 라이브 보드를 구성한다.
//   - 온도(기상도 밴드): lib/temperature/board.getTemperatureBoard(8) 직접 조회.
//     /api/temperature 는 TOP5 고정이라 8칸 밴드를 못 채우므로, 허용된 서버 확장
//     (limit 옵션)을 써서 서버에서 직접 8건을 가져온다.
//   - 크로스뷰: 자체 공개 API /api/crossview?limit=8 (approved 페어).
//   - 팟캐스트: 자체 공개 API /api/podcast?limit=1 (최신 에피소드).
//   - 공론장 최신글: lib/forum/queries.listPosts(anon) 최신 4건 직접 조회.
//   - 주민의 목소리: components/home/voices.getResidentVoices(anon) 공감 상위 3건.
// 어떤 데이터 소스의 실패(미구현 라우트·HTML·네트워크·비정상 봉투·쿼리 오류)도
// 모두 흡수하고 빈 값을 돌려준다. 홈은 절대 깨지지 않는다(graceful degradation).
//
// ⚠️ API 응답 봉투 계약(HTTP 경로에 한함):
//   - /api/crossview → data: CrossviewListResult { items, nextCursor }
//   - /api/podcast   → data: EpisodeListResult   { items, nextCursor }
//   공통 응답 규약: { data, error } (types/index.ts 의 ApiResponse<T>).
// ============================================================================

import { headers } from "next/headers";
import type { ApiResponse, Episode, ForumPost, TemperatureBoard, TemperatureBoardItem } from "@/types";
import type {
  CrossviewListResult,
  CrossviewPairWithArticles,
} from "@/lib/matching";
import type { EpisodeListResult } from "@/lib/podcast";
import { getTemperatureBoard } from "@/lib/temperature/board";
import { listPosts } from "@/lib/forum/queries";
import { createClient } from "@/lib/supabase/server";
import { sortTemperatureItems } from "./format";
import { getResidentVoices, type ResidentVoice } from "./voices";
import {
  getDeadlineItems,
  getResolutionStories,
  type DeadlineItem,
  type ResolutionStory,
} from "./action-layer";

/** 홈 라이브 보드에 표시할 항목 수 */
export const BOARD_LIMITS = {
  /** 공론 기상도 밴드 8칸 */
  temperature: 8,
  /** 리드(1) + 스트림 더보기(3) + 하단 대조 지면(4) = 8 */
  crossview: 8,
  /** 온에어 카드 1건 */
  podcast: 1,
  /** "지금 공론장에선" 최신 4건 */
  forumPosts: 4,
  /** "주민의 목소리" 3단 인용 */
  voices: 3,
  /** "놓치면 손해" 마감 카드 */
  deadlines: 3,
  /** "해결됐어요" 사례 */
  resolutions: 2,
} as const;

/** 홈에서 사용하는 라이브 보드 데이터 묶음 */
export interface HomeBoardData {
  /** 공론 온도 상위 8건 (rank 오름차순) */
  temperature: TemperatureBoardItem[];
  /** 온도 보드 산출 시각 (없으면 null) */
  temperatureComputedAt: string | null;
  /** 최신 크로스뷰 페어 최대 8건 (양측 기사 조인) */
  crossview: CrossviewPairWithArticles[];
  /** 최신 팟캐스트 에피소드 */
  podcast: Episode[];
  /** 공론장 최신 게시글 4건 */
  posts: ForumPost[];
  /** 공감 상위 댓글 3건 (주민의 목소리) */
  voices: ResidentVoice[];
  /** 놓치면 손해 — 마감 임박 순 (없으면 섹션 미노출) */
  deadlines: DeadlineItem[];
  /** 해결됐어요 — 최신 해결 순 (없으면 섹션 미노출) */
  resolutions: ResolutionStory[];
}

/** 서버에서 자기 자신을 호출하기 위한 절대 URL 베이스를 구성한다. */
async function resolveBaseUrl(): Promise<string> {
  // 1순위: 명시적으로 설정된 사이트 URL (배포 환경에서 주입 가능)
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, "");

  // 2순위: 현재 요청 헤더의 host 로 동일 오리진을 추론
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (host) {
    const proto =
      h.get("x-forwarded-proto") ??
      (host.startsWith("localhost") || host.startsWith("127.0.0.1")
        ? "http"
        : "https");
    return `${proto}://${host}`;
  }

  // 3순위: 로컬 개발 기본값
  return "http://localhost:3000";
}

/**
 * 자체 공개 API 를 호출해 ApiResponse<T> 봉투를 검증하고 data 만 돌려준다.
 * 어떤 실패(미구현 라우트·HTML 응답·네트워크 오류·비정상 봉투)든 fallback 반환.
 */
async function fetchApi<T>(path: string, fallback: T): Promise<T> {
  try {
    const base = await resolveBaseUrl();
    const res = await fetch(`${base}${path}`, {
      headers: { accept: "application/json" },
      // 라이브 보드는 짧게 캐싱(15분 온도 갱신 주기 고려). 실패해도 빈 상태로.
      next: { revalidate: 60 },
    });

    if (!res.ok) return fallback;

    // JSON 이 아니면(예: 라우트 미구현으로 HTML 404) 안전하게 폴백
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) return fallback;

    const json = (await res.json()) as ApiResponse<T> | unknown;
    if (!isOkEnvelope<T>(json)) return fallback;

    return json.data;
  } catch {
    // 네트워크/파싱 오류 등 모든 예외를 흡수한다.
    return fallback;
  }
}

/** 성공 봉투({ data, error: null }) 인지 런타임 검증 */
function isOkEnvelope<T>(value: unknown): value is { data: T; error: null } {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return "data" in v && v.error == null && v.data != null;
}

/** items 필드를 limit 만큼 안전하게 잘라낸다(배열이 아니면 빈 배열). */
function takeItems<T>(value: T[] | unknown, limit: number): T[] {
  return Array.isArray(value) ? value.slice(0, limit) : [];
}

/** 온도 보드를 서버에서 직접 조회한다(8건). 실패 시 빈 보드. */
async function fetchTemperatureBoard(): Promise<TemperatureBoard> {
  try {
    return await getTemperatureBoard(BOARD_LIMITS.temperature);
  } catch {
    return { items: [], computedAt: "" };
  }
}

/** 공론장 최신 게시글을 서버에서 직접 조회한다(anon). 실패 시 빈 배열. */
async function fetchForumPosts(): Promise<ForumPost[]> {
  try {
    const supabase = await createClient();
    const { posts } = await listPosts(supabase, undefined, BOARD_LIMITS.forumPosts);
    return posts;
  } catch {
    return [];
  }
}

/**
 * 홈 라이브 보드 데이터를 병렬로 가져온다.
 * 일부 소스가 없거나 실패해도 나머지는 정상 렌더된다.
 */
export async function fetchHomeBoard(): Promise<HomeBoardData> {
  const emptyCrossview: CrossviewListResult = { items: [], nextCursor: null };
  const emptyPodcast: EpisodeListResult = { items: [], nextCursor: null };

  const [
    temperatureBoard,
    crossviewResult,
    podcastResult,
    posts,
    voices,
    deadlines,
    resolutions,
  ] = await Promise.all([
    fetchTemperatureBoard(),
    fetchApi<CrossviewListResult>(
      `/api/crossview?limit=${BOARD_LIMITS.crossview}`,
      emptyCrossview,
    ),
    fetchApi<EpisodeListResult>(
      `/api/podcast?limit=${BOARD_LIMITS.podcast}`,
      emptyPodcast,
    ),
    fetchForumPosts(),
    getResidentVoices(BOARD_LIMITS.voices),
    getDeadlineItems(BOARD_LIMITS.deadlines),
    getResolutionStories(BOARD_LIMITS.resolutions),
  ]);

  const temperature = sortTemperatureItems(
    takeItems<TemperatureBoardItem>(
      temperatureBoard?.items,
      BOARD_LIMITS.temperature,
    ),
  );

  return {
    temperature,
    temperatureComputedAt: temperatureBoard?.computedAt || null,
    crossview: takeItems<CrossviewPairWithArticles>(
      crossviewResult?.items,
      BOARD_LIMITS.crossview,
    ),
    podcast: takeItems<Episode>(podcastResult?.items, BOARD_LIMITS.podcast),
    posts,
    voices,
    deadlines,
    resolutions,
  };
}
