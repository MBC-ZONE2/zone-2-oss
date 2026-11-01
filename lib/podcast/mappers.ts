// ============================================================================
// lib/podcast/mappers — DB row(snake_case) ↔ 도메인 타입(camelCase) 변환
//
// 규칙(types/index.ts): DB 는 snake_case, 애플리케이션 경계는 camelCase.
// ============================================================================

import type { Episode, EpisodeSourceRefs, EpisodeStatus } from "@/types";
import type { EpisodeRow } from "./types";

const EPISODE_STATUSES: readonly EpisodeStatus[] = [
  "generating",
  "review",
  "approved",
  "published",
  "failed",
];

/** 문자열 status 를 안전하게 EpisodeStatus 로 좁힌다. */
function toEpisodeStatus(value: string): EpisodeStatus {
  return (EPISODE_STATUSES as readonly string[]).includes(value)
    ? (value as EpisodeStatus)
    : "generating";
}

/** source_refs(jsonb) 를 EpisodeSourceRefs 로 안전 변환 */
function toSourceRefs(raw: unknown): EpisodeSourceRefs | null {
  if (!raw || typeof raw !== "object") return null;
  return raw as EpisodeSourceRefs;
}

/** podcast_episodes row → Episode (API 응답 형태) */
export function rowToEpisode(row: EpisodeRow): Episode {
  return {
    id: row.id,
    title: row.title,
    headline: row.headline ?? null,
    script: row.script,
    audioUrl: row.audio_url,
    durationSec: row.duration_sec,
    thumbnailUrl: row.thumbnail_url,
    sourceRefs: toSourceRefs(row.source_refs),
    status: toEpisodeStatus(row.status),
    reviewedBy: row.reviewed_by,
    scheduledFor: row.scheduled_for,
    publishedAt: row.published_at,
    createdAt: row.created_at,
  };
}

/** 목록 매핑 헬퍼 */
export function rowsToEpisodes(rows: EpisodeRow[]): Episode[] {
  return rows.map(rowToEpisode);
}
