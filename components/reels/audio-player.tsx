"use client";
// @deprecated 2026-09 검토의견(홈 2) — 홈 오디오 슬라이드·데스크탑 보드는 자체 플레이어 대신
// slides.tsx 의 <ListenButton>("▶ 듣기" → usePlayer().play) 만 두고, 재생 조작은 하단/좌 레일
// 백색원(전역 플레이어 시트)으로 통일했다. 현재 홈에서 import 하는 곳 없음. 삭제하지 않고 남긴다.
// 홈 오디오 슬라이드·데스크탑 보드용 플레이어 — 전역 PlayerProvider 의 리모컨.
// <audio> 를 만들지 않는다(앱 유일 오디오는 Provider 안). episodeId 로 play(ep) 하고,
// src 는 audioUrl 폴백(절대 URL 이면 그대로, 아니면 Provider 가 서버 스트리밍 라우트로).
// 라우드소싱 검토의견(0825 취합본) 반영: ±15초 스킵·배속을 시니어도 읽는 텍스트
// 버튼으로 제공한다(디자인 검토 "되감기·넘기기 필요", 시안 No.4 채택안, No.15 표기 참고).
// 재생 카운트(#117)는 Provider 가 실제 재생 시작 시 세션당 1회 기록한다.
// 진행 트랙은 role="slider"(components/podcast/player-progress 와 같은 키보드 계약):
// ←→↑↓ ±5초, Home/End 처음·끝, aria-valuetext "m:ss / m:ss".
import { useMemo } from "react";
import Waveform from "@/components/ui/waveform";
import { progressRatio, usePlayer, type PlayerEpisode } from "@/components/player/player-provider";

function fmt(sec: number): string {
  if (!Number.isFinite(sec)) return "0:00";
  const m = Math.floor(sec / 60);
  const s = String(Math.floor(sec % 60)).padStart(2, "0");
  return `${m}:${s}`;
}

/** 키보드 탐색 한 걸음(초) */
const KEY_STEP_SEC = 5;

function fmtRate(rate: number): string {
  return `${rate.toFixed(2).replace(/0$/, "")}×`;
}

export default function AudioPlayer({
  src,
  duration = 0,
  episodeId,
  title,
}: {
  src: string;
  duration?: number;
  /** 회차 id — 전역 플레이어의 current 판정·이어 듣기·재생 카운트 키. 없으면 src 로 식별 */
  episodeId?: string;
  /** Media Session 제목(선택) */
  title?: string;
}) {
  const player = usePlayer();
  const id = episodeId ?? src;
  const ep = useMemo<PlayerEpisode>(
    () => ({
      id,
      title: title ?? "오늘의 충북",
      audioUrl: src,
      durationSec: duration || null,
      publishedAt: null,
    }),
    [id, title, src, duration],
  );

  const isCurrent = player.current?.id === id;
  const playing = isCurrent && player.isPlaying;
  const cur = isCurrent ? player.currentTime : 0;
  const total = isCurrent && player.duration > 0 ? player.duration : duration;
  const rate = player.rate;

  const toggle = () => {
    if (playing) player.pause();
    else player.play(ep);
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!total || !isCurrent) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
    player.seek(ratio * total);
  };

  const skip = (delta: number) => {
    if (isCurrent) player.skip(delta);
  };

  // 슬라이더 키보드 계약 — 현재 회차가 아니면(트랙이 0 고정) 무시
  const onTrackKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!total || !isCurrent) return;
    let next: number | null = null;
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = cur - KEY_STEP_SEC;
    else if (e.key === "ArrowRight" || e.key === "ArrowUp") next = cur + KEY_STEP_SEC;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = total;
    if (next === null) return;
    e.preventDefault();
    player.seek(Math.min(Math.max(next, 0), total));
  };

  return (
    <div className="player">
      <div className="p-main">
        <button
          type="button"
          className="p-btn"
          onClick={toggle}
          aria-label={playing ? "일시정지" : "재생"}
        >
          {playing ? (
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden>
              <path d="M7 4h4v16H7zM13 4h4v16h-4z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden>
              <path d="M6 3l14 9-14 9V3z" />
            </svg>
          )}
        </button>
        <Waveform playing={playing} className="p-wave" />
        <div
          className="p-track"
          role="slider"
          tabIndex={0}
          aria-label="재생 위치"
          aria-valuemin={0}
          aria-valuemax={Math.round(total)}
          aria-valuenow={Math.min(Math.round(cur), Math.round(total))}
          aria-valuetext={`${fmt(cur)} / ${fmt(total)}`}
          aria-disabled={!isCurrent || !total ? true : undefined}
          onClick={seek}
          onKeyDown={onTrackKey}
        >
          <div
            className="p-fill"
            style={{ width: `${(progressRatio(cur, total) * 100).toFixed(2)}%` }}
          />
        </div>
        <span className="p-time">
          {fmt(cur)} / {fmt(total)}
        </span>
      </div>
      <div className="p-controls">
        <button
          type="button"
          className="p-skip"
          onClick={() => skip(-15)}
          aria-label="15초 뒤로"
        >
          − 15초
        </button>
        <button
          type="button"
          className="p-rate"
          onClick={player.cycleRate}
          aria-label={`재생 속도 ${fmtRate(rate)} — 누르면 변경`}
        >
          {fmtRate(rate)}
        </button>
        <button
          type="button"
          className="p-skip"
          onClick={() => skip(15)}
          aria-label="15초 앞으로"
        >
          + 15초
        </button>
      </div>
    </div>
  );
}
