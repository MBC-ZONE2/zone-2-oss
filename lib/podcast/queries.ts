// ============================================================================
// lib/podcast/queries — 공개 API 용 조회 헬퍼
//
// 공개 GET 은 anon 클라이언트 + RLS 로 published 만 노출되지만,
// 애플리케이션 레벨에서도 status='published' 필터를 명시해 이중 안전장치를 둔다.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Episode } from "@/types";
import type { EpisodeRow } from "./types";
import { rowToEpisode, rowsToEpisodes } from "./mappers";

const EPISODE_COLUMNS =
  "id, title, headline, script, audio_url, duration_sec, thumbnail_url, source_refs, status, reviewed_by, scheduled_for, published_at, created_at";

/** cursor(published_at) 기반 페이지네이션 결과 */
export interface EpisodeListResult {
  items: Episode[];
  /** 다음 페이지 cursor (없으면 null) */
  nextCursor: string | null;
}

/**
 * 발행된 에피소드 목록 (최신 발행순, cursor 페이지네이션).
 *
 * @param supabase anon 또는 service 클라이언트
 * @param limit 페이지 크기 (기본 20)
 * @param cursor 이전 페이지 마지막 published_at (이 값 미만을 가져온다)
 */
export async function listPublishedEpisodes(
  supabase: SupabaseClient,
  limit = 20,
  cursor?: string,
): Promise<EpisodeListResult> {
  let query = supabase
    .from("podcast_episodes")
    .select(EPISODE_COLUMNS)
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(limit + 1); // 다음 페이지 존재 여부 판별용으로 1개 더 조회

  if (cursor) {
    query = query.lt("published_at", cursor);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`에피소드 목록 조회 실패: ${error.message}`);
  }

  const rows = (data as EpisodeRow[] | null) ?? [];
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const items = rowsToEpisodes(page);

  const last = page[page.length - 1];
  const nextCursor = hasMore && last ? last.published_at : null;

  return { items, nextCursor };
}

/**
 * 발행된 에피소드 상세 (오디오 url + 스크립트).
 * @returns 미존재/미발행이면 null
 */
export async function getPublishedEpisode(
  supabase: SupabaseClient,
  id: string,
): Promise<Episode | null> {
  const { data, error } = await supabase
    .from("podcast_episodes")
    .select(EPISODE_COLUMNS)
    .eq("id", id)
    .eq("status", "published")
    .maybeSingle();

  if (error) {
    throw new Error(`에피소드 상세 조회 실패: ${error.message}`);
  }
  if (!data) return null;

  return rowToEpisode(data as EpisodeRow);
}
