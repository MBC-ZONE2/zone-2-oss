"use client";
// 브리핑 음파형 — 재생 중이면 막대가 움직이고, 아니면 낮은 정지 막대로 "오디오"임을 알린다.
// 색은 currentColor(종이 위 잉크 / 검은 세계 위 백색). reduced-motion 이면 정지.
import "@/app/wave.css";

export default function Waveform({
  playing,
  bars = 7,
  className = "",
}: {
  playing: boolean;
  bars?: number;
  className?: string;
}) {
  return (
    <span className={`wave${playing ? " is-on" : ""}${className ? " " + className : ""}`} aria-hidden="true">
      {Array.from({ length: bars }, (_, i) => (
        <i key={i} style={{ animationDelay: `${((i * 0.17) % 0.9).toFixed(2)}s` }} />
      ))}
    </span>
  );
}
