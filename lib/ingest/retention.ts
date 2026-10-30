// ============================================================================
// lib/ingest/retention — 수집 댓글 보존 기간 (YouTube API 서비스 약관·개인정보 최소 보유, 2026-10-26)
//
// 광역 매체 유튜브 댓글(source=mbc_cb)은 공론 온도 계산(최근 7일 창)에만 쓴다. 30일이 지난 댓글은 본문을 비워
// 저장하지 않는다 — 감정 분류값·작성자 해시·발행 시각은 집계 연속성을 위해 남긴다(개인 식별 정보 없음).
// 호출: /api/cron/ingest 가 매시 수집 뒤 한 번. 실패해도 수집 결과에 영향 없음.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";

export const YOUTUBE_COMMENT_BODY_RETENTION_DAYS = 30;

/** 보존 기간이 지난 유튜브 댓글 본문을 비운다. 비운 행 수를 돌려준다(실패 시 -1) */
export async function pruneYoutubeCommentBodies(sb: SupabaseClient, days = YOUTUBE_COMMENT_BODY_RETENTION_DAYS): Promise<number> {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  try {
    const { data, error } = await sb
      .from("comments")
      .update({ body: "" })
      .eq("source", "mbc_cb")
      .lt("published_at", cutoff)
      .neq("body", "")
      .select("id");
    if (error) throw new Error(error.message);
    const n = data?.length ?? 0;
    if (n > 0) console.log(`[retention] 유튜브 댓글 본문 비움 ${n}건 (${days}일 경과)`);
    return n;
  } catch (e) {
    console.error("[retention] 댓글 본문 정리 실패:", e instanceof Error ? e.message : e);
    return -1;
  }
}
