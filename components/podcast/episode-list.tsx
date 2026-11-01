// ============================================================================
// components/podcast/episode-list — 팟캐 목록(종이) (서버 컴포넌트 호환)
//
// 순서: 헤더 띠(검정 #000, "오늘의 충북 · AI 오디오 브리핑" 백색 활자 + 'AI가 만든'
// 분홍 스탬프) → 최신 회차 큰 행("최신 회차 · 5일 전" → 내용 요약 헤드라인 28px 700
// → 잉크 원 ▶ 56px 인라인 플레이어) → 지난 회차 괘선 목록(EpisodeCard).
// 카드·면 없음, 등장 애니메이션 없음.
//
// Figma 코멘트 #4(디자인 검토, 2026-09-11): "전체 회차 보기 삭제, 제목=내용축약이므로 대본
// 발췌부분 삭제". DB 의 title 은 날짜("오늘의 충북 9월 8일")라 내용 축약이 아니므로
// 제목 자리에 episodeHeadline(대본 topics 조합)을 쓰고, 날짜 제목은 링크 title·sr-only
// 로만 남긴다(회차 식별). lead·topics 별도 줄과 발 링크(pc-more)는 없앴다.
// Figma 코멘트 #2(HanSeol): 날짜는 상대 표기(relativeKo) — 절대 날짜는 <time dateTime>·
// title 에 남긴다. 페이지가 force-dynamic 이라 서버에서 계산해 내려간다(하이드레이션 안전).
// 재생·NEW 판정은 클라이언트 아일랜드(PodcastPlayer·NewBadge).
// ============================================================================

import Link from "next/link";
import type { Episode } from "@/types";
import { EpisodeCard } from "./episode-card";
import { PodcastPlayer } from "./podcast-player";
import { NewBadge } from "./new-badge";
// 배럴(@/lib/podcast) 대신 깊은 경로 — 생성 파이프라인(lib/ai·service 클라이언트)을 끌고 오지 않는다
import { episodeDisplayHeadline } from "@/lib/podcast/script";
import { relativeKo, absoluteKo } from "@/lib/ui/relative-time";
import { region } from "@/config/region";

export interface EpisodeListProps {
  episodes: Episode[];
}

/** 녹음실 띠 — 목록 머리. 컬럼 밖 뷰포트 폭까지 번진다(podcast.css ::before) */
export function StudioBand({ count }: { count?: number }) {
  return (
    <header className="pc-band px-5 sm:px-[76px]">
      <h1>{region.podcast.seriesName} · {region.podcast.seriesSub}</h1>
      <span className="pc-stamp">AI가 만든</span>
      {typeof count === "number" && count > 0 ? (
        <span className="pc-band-n">{count}회차</span>
      ) : null}
    </header>
  );
}

/** 빈 상태 — 점선 괘선(아직 없음) 사이 활자 */
function EmptyState() {
  return (
    <div className="pc-empty px-5 sm:px-[76px]">
      <strong>아직 게시된 회차가 없습니다.</strong>
      <p>매일 아침, {region.podcast.seriesName} 브리핑이 올라옵니다.</p>
    </div>
  );
}

/** 최신 회차 큰 행 — "최신 회차 · 상대날짜" + 내용 요약 헤드라인 28px 700 + 잉크 원 ▶ */
function LeadEpisode({ episode }: { episode: Episode }) {
  const publishedAt = episode.publishedAt ?? episode.createdAt;
  // 상대 표기만 화면에 보이고, 절대 날짜는 dateTime·title 로 남는다
  const relLabel = relativeKo(publishedAt);
  const absLabel = absoluteKo(publishedAt);
  const dateTitle = episode.title?.trim() || "";
  // 표시 제목 = 대본에서 지은 내용 요약 헤드라인(실패하면 날짜 제목)
  const heading = episodeDisplayHeadline(episode) || "제목 준비 중";

  return (
    <section aria-label="최신 회차" className="pc-lead px-5 sm:px-[76px]">
      <p className="pc-k">
        최신 회차
        {relLabel ? (
          <>
            <span className="pc-sep" aria-hidden>
              ·
            </span>
            <time dateTime={publishedAt ?? undefined} title={absLabel}>
              {relLabel}
            </time>
          </>
        ) : null}
        <NewBadge publishedAt={episode.publishedAt} />
      </p>
      <h2>
        <Link href={`/podcast/${episode.id}`} title={dateTitle || undefined}>
          {heading}
          {/* 회차 식별용 날짜 제목 — 화면에는 없지만 낭독기·툴팁에는 남긴다 */}
          {dateTitle ? <span className="sr-only"> ({dateTitle})</span> : null}
        </Link>
      </h2>

      <PodcastPlayer
        episodeId={episode.id}
        audioUrl={episode.audioUrl}
        durationSec={episode.durationSec}
        title={dateTitle}
        headline={heading}
        variant="inline"
      />
    </section>
  );
}

/** 팟캐 목록 — 녹음실 띠 + 최신 회차 + 지난 회차 괘선 목록 */
export function EpisodeList({ episodes }: EpisodeListProps) {
  if (episodes.length === 0) {
    return (
      <>
        <StudioBand />
        <EmptyState />
      </>
    );
  }

  const [lead, ...rest] = episodes;

  return (
    <>
      <StudioBand count={episodes.length} />
      <LeadEpisode episode={lead} />

      {rest.length > 0 ? (
        <section aria-label="지난 회차" className="pc-past px-5 sm:px-[76px]">
          <h2 className="pc-h">
            지난 회차 <span>{rest.length}편</span>
          </h2>
          <ol className="pc-rows">
            {rest.map((episode) => (
              <EpisodeCard key={episode.id} episode={episode} />
            ))}
          </ol>
        </section>
      ) : null}
    </>
  );
}
