"use client";
// 카드뉴스식 가로 레일 — 공고·여론광장·카드뉴스처럼 목록형 항목을
// 한 장씩 옆으로 넘겨 보게 한다 (스냅 + 좌우 버튼 + n/N).
import { useRef, useState, type ReactNode } from "react";

export default function CardRail({
  children,
  count,
}: {
  children: ReactNode;
  count: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [idx, setIdx] = useState(0);

  const onScroll = () => {
    const el = ref.current;
    if (!el || !el.firstElementChild) return;
    const cardW = el.firstElementChild.getBoundingClientRect().width + 12;
    setIdx(Math.min(count - 1, Math.max(0, Math.round(el.scrollLeft / cardW))));
  };

  const go = (dir: number) => {
    const el = ref.current;
    if (!el || !el.firstElementChild) return;
    const cardW = el.firstElementChild.getBoundingClientRect().width + 12;
    el.scrollTo({ left: (idx + dir) * cardW, behavior: "smooth" });
  };

  return (
    <div className="rail-wrap">
      <div className="rail" ref={ref} onScroll={onScroll}>
        {children}
      </div>
      <div className="rail-nav">
        <button
          type="button"
          onClick={() => go(-1)}
          disabled={idx === 0}
          aria-label="이전 장"
        >
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <span className="rail-count">
          {idx + 1} / {count}
        </span>
        <button
          type="button"
          onClick={() => go(1)}
          disabled={idx >= count - 1}
          aria-label="다음 장"
        >
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      </div>
      <p className="rail-hint" aria-hidden="true">
        옆으로 밀면 다음 장이 나와요
      </p>
    </div>
  );
}
