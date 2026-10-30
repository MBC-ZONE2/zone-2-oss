"use client";

// ============================================================================
// components/podcast/player-parts — 플레이어 공용 조각 (목록 인라인·행·검은 세계 공용)
//
// 원 버튼(▶/❚❚)·활자 버튼(±15초·배속)·이어 듣기 안내·오류 안내·오디오 미준비 안내.
// 색·형태는 app/podcast.css 가 톤(.pc-list 종이 / .pc-play 검은 세계)별로 정한다.
// 로직 없음 — 콜백만 받아 부른다.
// ============================================================================

import { formatKoreanClock, formatPlaybackRate } from "./format";

export function PlayGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M7 4.5v15l12-7.5z" />
    </svg>
  );
}

export function PauseGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <rect x="6" y="4.5" width="4.5" height="15" />
      <rect x="13.5" y="4.5" width="4.5" height="15" />
    </svg>
  );
}

/** 원 버튼 — 재생/일시정지. 종이 위 잉크 원 56px, 검은 세계 백색원 64px(CSS) */
export function PlayCircle({
  isPlaying,
  onToggle,
  className = "",
}: {
  isPlaying: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={["pc-circle", className].filter(Boolean).join(" ")}
      aria-label={isPlaying ? "일시정지" : "재생"}
      aria-pressed={isPlaying}
      onClick={onToggle}
    >
      {isPlaying ? <PauseGlyph /> : <PlayGlyph />}
    </button>
  );
}

/** ±15초·배속 활자 버튼 행 — 44px, 테두리 1px(종이: 잉크 / 검은 세계: 백색) */
export function TypeControls({
  playbackRate,
  onSkip,
  onRate,
  children,
  className = "pc-ctl",
}: {
  playbackRate: number;
  onSkip: (delta: number) => void;
  onRate: () => void;
  /** 가운데 끼워 넣을 요소(검은 세계의 백색원) */
  children?: React.ReactNode;
  className?: string;
}) {
  const rateText = formatPlaybackRate(playbackRate);
  return (
    <div className={className}>
      <button type="button" className="pc-tbtn" aria-label="15초 뒤로" onClick={() => onSkip(-15)}>
        −15초
      </button>
      {children}
      <button type="button" className="pc-tbtn" aria-label="15초 앞으로" onClick={() => onSkip(15)}>
        +15초
      </button>
      <button
        type="button"
        className="pc-tbtn rate"
        aria-label={`재생 속도 ${rateText}배`}
        onClick={onRate}
      >
        {rateText}×
      </button>
    </div>
  );
}

/** 이어 듣기 안내 — 복원된 위치 표시 + 처음부터 옵션 (괘선 위 활자) */
export function ResumeBanner({
  resumeAt,
  onRestart,
  onDismiss,
}: {
  resumeAt: number;
  onRestart: () => void;
  onDismiss: () => void;
}) {
  const label = formatKoreanClock(resumeAt) ?? "이전 위치";
  return (
    <div role="status" className="pc-note">
      <span className="pc-note-k">이어 듣기</span>
      <span>{label}부터 이어 듣는 중입니다.</span>
      <button type="button" className="pc-tlink" onClick={onRestart}>
        처음부터 듣기
      </button>
      <button type="button" className="pc-tlink" onClick={onDismiss} aria-label="이어 듣기 안내 닫기">
        닫기
      </button>
    </div>
  );
}

/** 오디오 로드 실패 인라인 오류 + 다시 시도 (모달 금지) */
export function ErrorNotice({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="pc-note">
      <span>오디오를 불러오지 못했습니다.</span>
      <button type="button" className="pc-tlink" onClick={onRetry}>
        다시 시도
      </button>
    </div>
  );
}

/** 오디오 미준비(스토리지 미구현) 안내 — 점선 괘선(아직 없음) */
export function PendingNotice() {
  return <p className="pc-pending">오디오 준비 중입니다.</p>;
}
