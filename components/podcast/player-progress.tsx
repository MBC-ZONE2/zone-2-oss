"use client";

// ============================================================================
// components/podcast/player-progress — 진행선(탐색 슬라이더) (FR-PC-03·07)
//
// role="slider" 커스텀 트랙. 포인터 드래그로 탐색하고 버퍼링 구간을 표시한다.
// 44px 터치 영역 안에 SVG 선 하나: 바닥 점선(아직 없음) → 버퍼 구간 가는 실선(도착)
// → 재생 구간 2px 실선. 재생 실선은 pathLength=1 로 정규화해 stroke-dashoffset 으로
// 왼쪽부터 잇는다(이음 400ms outCubic, CSS). 검은 세계(tone="black")에서는 바닥선이
// 인트로 도로 점선(dash 52/120)이 된다.
// ARIA slider 키보드 계약을 자체 구현한다: ←→ ±5초, ↑↓ ±5초, Home/End 처음·끝.
// 처리한 키는 전파를 막아 상위 플레이어 단축키와 이중 동작하지 않게 한다.
// ============================================================================

import { useRef, useState } from "react";
import { formatPlayerTime } from "./format";

export interface PlayerProgressProps {
  currentTime: number;
  duration: number;
  bufferedEnd: number;
  isBuffering: boolean;
  /** 탐색 요청(초) */
  onSeek: (sec: number) => void;
  /** 톤 — 종이(기본) / 검은 세계(도로 점선) */
  tone?: "paper" | "black";
}

/** 0~1 로 클램프 */
function ratio(value: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(Math.max(value / total, 0), 1);
}

/** 진행선 — 드래그 탐색 + 버퍼/진행/버퍼링 표시 */
export function PlayerProgress({
  currentTime,
  duration,
  bufferedEnd,
  isBuffering,
  onSeek,
  tone = "paper",
}: PlayerProgressProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const played = ratio(currentTime, duration);
  const buffered = ratio(bufferedEnd, duration);

  /** 포인터 X 좌표를 재생 시각(초)으로 변환 */
  const clientXToTime = (clientX: number): number => {
    const el = trackRef.current;
    if (!el || duration <= 0) return 0;
    const rect = el.getBoundingClientRect();
    return ratio(clientX - rect.left, rect.width) * duration;
  };

  const handleDown = (e: React.PointerEvent<HTMLDivElement>) => {
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    onSeek(clientXToTime(e.clientX));
  };

  /** ARIA slider 키보드 계약 (←→↑↓ ±5초, Home/End 처음·끝) */
  const KEY_STEP_SEC = 5;
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    let next: number | null = null;
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      next = Math.max(currentTime - KEY_STEP_SEC, 0);
    } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      next = Math.min(currentTime + KEY_STEP_SEC, duration || 0);
    } else if (e.key === "Home") {
      next = 0;
    } else if (e.key === "End") {
      next = duration || 0;
    }
    if (next === null) return;
    e.preventDefault();
    e.stopPropagation(); // 상위 플레이어 단축키(←→)와 이중 동작 방지
    onSeek(next);
  };
  const handleMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragging) onSeek(clientXToTime(e.clientX));
  };
  const handleUp = (e: React.PointerEvent<HTMLDivElement>) => {
    setDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // 캡처가 없을 수 있음 — 무시
    }
  };

  const cls = [
    "pc-prog",
    tone === "black" ? "black" : "",
    dragging ? "is-drag" : "",
    isBuffering ? "is-buffering" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      ref={trackRef}
      role="slider"
      tabIndex={0}
      aria-label="재생 위치"
      aria-valuemin={0}
      aria-valuemax={Math.max(Math.floor(duration), 0)}
      aria-valuenow={Math.min(Math.floor(currentTime), Math.floor(duration) || 0)}
      aria-valuetext={`${formatPlayerTime(currentTime)} / ${formatPlayerTime(duration)}`}
      onPointerDown={handleDown}
      onPointerMove={handleMove}
      onPointerUp={handleUp}
      onPointerCancel={handleUp}
      onKeyDown={handleKeyDown}
      className={cls}
    >
      <svg aria-hidden focusable="false">
        {/* 바닥 점선 — 아직 오지 않은 구간(종이: 1/3 점, 검은 세계: 도로 52/120) */}
        <line className="pp-base" x1="0" y1="22" x2="100%" y2="22" />
        {/* 버퍼링된 구간 — 가는 실선(도착) */}
        <line
          className="pp-buf"
          x1="0"
          y1="22"
          x2="100%"
          y2="22"
          pathLength={1}
          strokeDasharray="1 1"
          strokeDashoffset={1 - buffered}
        />
        {/* 재생된 구간 — 2px 실선, 왼쪽부터 잇는다 */}
        <line
          className="pp-fill"
          x1="0"
          y1="22"
          x2="100%"
          y2="22"
          pathLength={1}
          strokeDashoffset={1 - played}
        />
      </svg>
      {/* 진행 끝 점 10px(원형 허용). 터치 영역은 44px 높이의 트랙 전체 */}
      <span className="pp-dot" aria-hidden style={{ left: `${played * 100}%` }} />
    </div>
  );
}
