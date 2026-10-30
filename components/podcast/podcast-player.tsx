"use client";

// ============================================================================
// components/podcast/podcast-player — 종이(목록) 위 오디오 플레이어 UI (FR-PC-02·03·07)
//
// 전역 PlayerProvider 의 단일 <audio> 를 usePodcastPlayer(리모컨 훅)로 제어한다 —
// 여기서 <audio> 를 만들지 않는다. 재생/일시정지·15초 스킵·배속 순환·진행선 드래그·
// 시간표시·버퍼링·오류(인라인 재시도)·이어 듣기 복원을 제공한다.
// audioUrl 이 null 이면 "오디오 준비 중" 안내를 렌더한다(기존 동작 유지).
//
// variant:
//   - "inline"(기본) : 최신 회차 큰 행 — 잉크 원 ▶ 56px + 진행선 + 활자 버튼 행.
//   - "row"           : 지난 회차 괘선 행 — ▶ 활자 44px. 재생을 시작하면(또는 이어 듣기
//                       위치가 있으면) 행 아래로 진행선·시간·활자 버튼이 펼쳐진다.
// 검은 세계(상세)는 play-screen.tsx 가 훅을 직접 쓴다. 오디오 로직/훅은 손대지 않는다.
// ============================================================================

import { usePodcastPlayer } from "./use-podcast-player";
import Waveform from "@/components/ui/waveform";
import { PlayerProgress } from "./player-progress";
import {
  ErrorNotice,
  PauseGlyph,
  PendingNotice,
  PlayCircle,
  PlayGlyph,
  ResumeBanner,
  TypeControls,
} from "./player-parts";
import { formatPlayerTime } from "./format";

export type PodcastPlayerVariant = "inline" | "row";

export interface PodcastPlayerProps {
  episodeId: string;
  audioUrl: string | null;
  durationSec?: number | null;
  /** 날짜 제목("오늘의 충북 9월 8일") — 큐·시트 행 제목 */
  title?: string;
  /** 내용 요약 헤드라인 — 접근성 라벨·잠금 화면 제목 */
  headline?: string | null;
  /** 렌더 톤 — 최신 행은 "inline", 지난 회차 행은 "row". */
  variant?: PodcastPlayerVariant;
}

/** 실제 플레이어 (audioUrl 존재 시). 훅 규칙상 조건부 렌더 밖에서 분리. */
function PlayerCore({
  episodeId,
  audioUrl,
  durationSec,
  title,
  headline,
  variant,
}: {
  episodeId: string;
  audioUrl: string;
  durationSec?: number | null;
  title?: string;
  headline?: string | null;
  variant: PodcastPlayerVariant;
}) {
  const p = usePodcastPlayer(episodeId, durationSec, { audioUrl, title, headline });
  /** 접근성 라벨 — 내용 헤드라인이 있으면 그것 */
  const label = headline?.trim() || title;

  // 키보드: Space=재생/정지, ←/→=15초 스킵. 버튼 자체 클릭엔 위임한다.
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const isButton = (e.target as HTMLElement).tagName === "BUTTON";
    if (e.key === " " || e.key === "Spacebar") {
      if (isButton) return;
      e.preventDefault();
      p.togglePlay();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      p.skip(-15);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      p.skip(15);
    }
  };

  const notices = (
    <>
      {p.resumeAt != null && (
        <ResumeBanner resumeAt={p.resumeAt} onRestart={p.restartFromZero} onDismiss={p.dismissResume} />
      )}
      {p.hasError && <ErrorNotice onRetry={p.retry} />}
    </>
  );

  const progress = (
    <>
      <PlayerProgress
        currentTime={p.currentTime}
        duration={p.duration}
        bufferedEnd={p.bufferedEnd}
        isBuffering={p.isBuffering}
        onSeek={p.seekTo}
      />
      <div className="pc-times">
        <span aria-hidden>{formatPlayerTime(p.currentTime)}</span>
        <span aria-hidden>{formatPlayerTime(p.duration)}</span>
      </div>
    </>
  );

  if (variant === "row") {
    // 행 플레이어 — ▶ 활자만 보이다가, 재생이 시작되면 아래로 펼쳐진다
    const active = p.isPlaying || p.currentTime > 0 || p.resumeAt != null || p.hasError;
    return (
      <div
        role="group"
        aria-label={label ? `${label} 플레이어` : "팟캐스트 플레이어"}
        onKeyDown={handleKeyDown}
        className="pc-rowplayer"
      >
        <button
          type="button"
          className="pc-row-play"
          aria-label={p.isPlaying ? "일시정지" : "재생"}
          aria-pressed={p.isPlaying}
          onClick={p.togglePlay}
        >
          {p.isPlaying ? <PauseGlyph /> : <PlayGlyph />}
        </button>
        {active && (
          <>
            {notices}
            {progress}
            <TypeControls playbackRate={p.playbackRate} onSkip={p.skip} onRate={p.cycleRate} />
          </>
        )}
      </div>
    );
  }

  return (
    <div
      role="group"
      aria-label={label ? `${label} 플레이어` : "팟캐스트 플레이어"}
      onKeyDown={handleKeyDown}
      className="pc-player"
    >
      {notices}
      <div className="pc-transport">
        <PlayCircle isPlaying={p.isPlaying} onToggle={p.togglePlay} />
        <Waveform playing={p.isPlaying} className="pc-wave" />
        <div className="pc-prog-col">{progress}</div>
      </div>
      <TypeControls playbackRate={p.playbackRate} onSkip={p.skip} onRate={p.cycleRate} />
    </div>
  );
}

/** 공개 플레이어 — audioUrl 이 없으면 준비 중 안내를 렌더한다. */
export function PodcastPlayer({
  episodeId,
  audioUrl,
  durationSec,
  title,
  headline,
  variant = "inline",
}: PodcastPlayerProps) {
  if (!audioUrl) return <PendingNotice />;
  return (
    <PlayerCore
      episodeId={episodeId}
      audioUrl={audioUrl}
      durationSec={durationSec}
      title={title}
      headline={headline}
      variant={variant}
    />
  );
}
