// ============================================================================
// components/podcast/episode-card — 지난 회차 괘선 행 (FR-PC-01·06)
//
// 괘선 1px 한 행(≥64px): 내용 요약 헤드라인 17px 700(상세 링크, 두 줄)
// → "5일 전 · 4분 51초" 13px 보조색 · 우측 ▶ 활자.
//
// Figma 코멘트 #4(디자인 검토, 2026-09-11): 제목은 내용 축약이어야 한다 → 날짜 제목 대신
// episodeHeadline(대본 topics 조합)을 쓰고 대본 발췌(lead)·키워드 줄은 없앴다.
// 날짜 제목은 링크 title·sr-only 로 남긴다(회차 식별).
// Figma 코멘트 #2(HanSeol): 날짜는 상대 표기 — 절대 날짜는 <time dateTime>·title 에.
// 행 자체는 상태가 없어 서버 컴포넌트로 두고, 재생/NEW 판정 같은 상호작용은
// 클라이언트 아일랜드(PodcastPlayer row 변형·NewBadge)에 위임한다.
// ============================================================================

import Link from "next/link";
import type { Episode } from "@/types";
import { PodcastPlayer } from "./podcast-player";
import { NewBadge } from "./new-badge";
import { formatKoreanClock } from "./format";
// 배럴(@/lib/podcast) 대신 깊은 경로 — 생성 파이프라인(lib/ai·service 클라이언트)을 끌고 오지 않는다
import { episodeDisplayHeadline } from "@/lib/podcast/script";
import { relativeKo, absoluteKo } from "@/lib/ui/relative-time";

export interface EpisodeCardProps {
  episode: Episode;
}

/** 지난 회차 한 행 — 헤드라인 + "상대날짜 · N분 N초" + ▶ 활자(행 플레이어) */
export function EpisodeCard({ episode }: EpisodeCardProps) {
  const publishedAt = episode.publishedAt ?? episode.createdAt;
  const relLabel = relativeKo(publishedAt);
  const absLabel = absoluteKo(publishedAt);
  // 도면(mobile-podcast-notices)의 행 메타 = "날짜 · 4분 51초"
  const clock = formatKoreanClock(episode.durationSec);
  const dateTitle = episode.title?.trim() || "";
  const heading = episodeDisplayHeadline(episode) || "제목 준비 중";

  return (
    <li className="pc-row">
      <h3>
        <Link href={`/podcast/${episode.id}`} title={dateTitle || undefined}>
          {heading}
          {/* 회차 식별용 날짜 제목 — 화면 밖(낭독기·툴팁)에만 남긴다 */}
          {dateTitle ? <span className="sr-only"> ({dateTitle})</span> : null}
        </Link>
      </h3>
      <p className="pc-meta">
        {relLabel ? (
          <time dateTime={publishedAt ?? undefined} title={absLabel}>
            {relLabel}
          </time>
        ) : null}
        {relLabel && clock ? (
          <span className="pc-sep" aria-hidden>
            ·
          </span>
        ) : null}
        {clock ? <span>{clock}</span> : null}
        <NewBadge publishedAt={episode.publishedAt} />
      </p>

      <PodcastPlayer
        episodeId={episode.id}
        audioUrl={episode.audioUrl}
        durationSec={episode.durationSec}
        title={dateTitle}
        headline={heading}
        variant="row"
      />
    </li>
  );
}
