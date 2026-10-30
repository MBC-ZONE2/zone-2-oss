// ============================================================================
// /podcast/[id] — 에피소드 상세 = 검은 세계 재생 화면 (FR-PC-04·05)
//
// 서버 컴포넌트: Supabase anon + RLS 로 published 만 조회. 미발행/없음 → notFound.
// (자체 GET /api/podcast/[id] 와 동일한 조회 헬퍼를 직접 사용 — 자기 라우트
//  재fetch 대신 코드베이스의 다른 상세 페이지와 동일한 패턴.)
// 화면은 클라이언트 PlayScreen(components/podcast/play-screen)이 그린다:
// 대본 단락 동기·도로 점선 진행선·백색원 비행·종료 백색 확장.
// Next15: params 는 Promise 이므로 await.
// ============================================================================

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPublishedEpisode, episodeDisplayHeadline } from "@/lib/podcast";
import type { Episode } from "@/types";
import { PlayScreen } from "@/components/podcast/play-screen";
import { JsonLd } from "@/components/seo/json-ld";
import { absUrl, podcastEpisodeJsonLd } from "@/lib/seo/site";
import "@/app/podcast.css";
import { region } from "@/config/region";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

/** published 에피소드 조회 — 실패는 null 로 처리(상위에서 404) */
async function fetchEpisode(id: string): Promise<Episode | null> {
  try {
    const supabase = await createClient();
    return await getPublishedEpisode(supabase, id);
  } catch (error) {
    console.error("[/podcast/:id] 상세 조회 실패:", error);
    return null;
  }
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;
  const episode = await fetchEpisode(id);
  // 탭·공유 제목은 내용 헤드라인(피그마 #4) — 날짜 제목은 설명 앞머리에 남긴다
  const title = episode ? episodeDisplayHeadline(episode) || episode.title?.trim() || "AI 팟캐스트" : "AI 팟캐스트";
  return {
    title, // layout 의 template("%s · ZONE-2")이 접미를 붙인다 — 여기서 또 붙이면 "· ZONE-2 · ZONE-2"
    description:
      `${region.podcast.seriesName} — 주요 기사와 시민 댓글을 AI가 종합한 오디오 브리핑.`,
  };
}

export default async function PodcastDetailPage({ params }: PageProps) {
  const { id } = await params;
  const episode = await fetchEpisode(id);
  if (!episode) notFound();

  const ld = podcastEpisodeJsonLd({
    id: episode.id,
    name: episodeDisplayHeadline(episode) || episode.title?.trim() || region.podcast.seriesName,
    description: episode.title?.trim() ? `${episode.title.trim()} — 두 매체 기사와 시민 댓글을 종합한 AI 오디오 브리핑(양사 검수)` : `${region.podcast.seriesName} — AI 오디오 브리핑(양사 검수)`,
    datePublished: episode.publishedAt,
    durationSec: episode.durationSec,
    image: absUrl(episode.thumbnailUrl),
  });

  return (
    <main>
      <JsonLd data={ld} />
      <PlayScreen
        episodeId={episode.id}
        title={episode.title ?? ""}
        headline={episodeDisplayHeadline(episode)}
        script={episode.script}
        audioUrl={episode.audioUrl}
        durationSec={episode.durationSec}
        publishedAt={episode.publishedAt}
        createdAt={episode.createdAt}
      />
    </main>
  );
}
