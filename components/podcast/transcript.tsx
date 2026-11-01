"use client";

// ============================================================================
// components/podcast/transcript — 검은 세계의 대본 (FR-PC-05)
//
// 좌상단 인트로 문장 자리(y 138)에서 시작하는 단락 목록. 현재 단락은 22px #f4f5f7,
// 지난 단락은 #919191, 다음 단락은 #919191 α.62(인트로 ①~④ 줄과 같은 회색 — 검은 세계 위 3.04:1).
// 단락 동기 = 글자수 비례(script.ts). 단락이 바뀌면 현재 단락이 영역 맨 위로
// 스크롤된다(사용자가 손으로 읽는 중이면 다음 단락 전환 때만 따라간다).
// 오디오가 없으면(duration 0) 동기 없이 전부 밝은 활자로 찍는다.
// ============================================================================

import { useEffect, useMemo, useRef } from "react";
import { paragraphIndexAt, paragraphStarts, splitScript } from "./script";

export interface TranscriptProps {
  script: string | null | undefined;
  currentTime: number;
  duration: number;
  /** 재생 중일 때만 자동 스크롤한다 */
  isPlaying: boolean;
  /** 접근성 — 대본 영역 라벨 */
  ariaLabel?: string;
}

export function Transcript({
  script,
  currentTime,
  duration,
  isPlaying,
  ariaLabel = "대본",
}: TranscriptProps) {
  const paragraphs = useMemo(() => splitScript(script), [script]);
  const starts = useMemo(() => paragraphStarts(paragraphs, duration), [paragraphs, duration]);
  const synced = duration > 0 && paragraphs.length > 0;
  const current = synced ? paragraphIndexAt(starts, currentTime) : -1;

  const boxRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLLIElement | null>>([]);

  // 단락이 바뀌면 현재 단락을 영역 맨 위(= y 138 자리)로 올린다
  useEffect(() => {
    if (!isPlaying || current < 0) return;
    const box = boxRef.current;
    const el = itemRefs.current[current];
    if (!box || !el) return;
    let reduced = false;
    try {
      reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      reduced = false;
    }
    box.scrollTo({ top: el.offsetTop - box.offsetTop, behavior: reduced ? "auto" : "smooth" });
  }, [current, isPlaying]);

  if (paragraphs.length === 0) {
    return (
      <div className="pc-script is-static" ref={boxRef} aria-label={ariaLabel} role="region">
        <p className="pc-script-empty">대본이 아직 없습니다.</p>
      </div>
    );
  }

  return (
    <div
      className={synced ? "pc-script" : "pc-script is-static"}
      ref={boxRef}
      role="region"
      aria-label={ariaLabel}
    >
      <ol>
        {paragraphs.map((p, i) => {
          const state = !synced ? undefined : i < current ? "past" : i === current ? "current" : "next";
          return (
            <li
              key={`${i}-${p.slice(0, 12)}`}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              data-state={state}
              aria-current={state === "current" ? "true" : undefined}
            >
              {p}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
