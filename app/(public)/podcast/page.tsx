// ============================================================================
// /podcast — 오늘의 충북(AI 팟캐) 목록 = 종이 지면
//
// 서버 컴포넌트: Supabase anon 클라이언트 + RLS 로 published 에피소드만 조회.
// 스키마 미적용/조회 실패 시에도 빈 목록으로 안전하게 렌더한다.
// 조판: 녹음실 띠 → 최신 회차 큰 행 → 지난 회차 괘선 목록 (components/podcast/episode-list).
// ============================================================================

import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { listPublishedEpisodes } from "@/lib/podcast";
import type { Episode } from "@/types";
import { EpisodeList } from "@/components/podcast/episode-list";
import "@/app/podcast.css";
import { region } from "@/config/region";

export const metadata: Metadata = {
  title: `${region.podcast.seriesName} · ${region.podcast.seriesSub}`, // layout template 이 " · ZONE-2" 를 붙인다
  description:
    `${region.podcast.seriesName} — 주요 기사와 댓글을 AI가 종합한 5분 브리핑. 매일 발행.`,
};

// 발행 데이터는 자주 바뀌지 않으므로 동적 렌더(요청 시 최신 조회)로 둔다.
export const dynamic = "force-dynamic";

/** 발행 에피소드 조회 — 실패 시 빈 배열로 폴백 */
async function fetchEpisodes(): Promise<Episode[]> {
  try {
    const supabase = await createClient();
    const { items } = await listPublishedEpisodes(supabase, 20);
    return items;
  } catch (error) {
    console.error("[/podcast] 에피소드 조회 실패:", error);
    return [];
  }
}

export default async function PodcastPage() {
  const episodes = await fetchEpisodes();

  return (
    <main className="pc-list">
      <EpisodeList episodes={episodes} />
    </main>
  );
}
