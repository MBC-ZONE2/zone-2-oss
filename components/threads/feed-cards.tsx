"use client";

// ============================================================================
// components/threads/feed-cards — 경량 카드뉴스 스와이프(실 생성 PNG)
//
// 실제 생성 PNG(/api/crossview/[id]/card/[i], 4:5)만 스와이프로 보여 준다.
// 「일점 지면」: 라운드·그림자·유리 없이 괘선 상하 블록. 도트 인디케이터는
// 잉크 점(원형 허용). 현재 목록은 활자 행만 쓰므로 이 컴포넌트는 미마운트 상태다.
// ============================================================================

import { useState } from "react";

export function FeedCards({
  pairId,
  count,
}: {
  pairId: string;
  /** 카드 컷 수 (card_data.slides 길이) */
  count: number;
}) {
  const [index, setIndex] = useState(0);
  const [startX, setStartX] = useState<number | null>(null);

  if (!count || count < 1) return null;
  const go = (n: number) => setIndex(Math.max(0, Math.min(count - 1, n)));

  return (
    <div className="flex flex-col gap-2">
      <div
        className="relative overflow-hidden border-y border-line bg-background"
        onTouchStart={(e) => setStartX(e.touches[0]?.clientX ?? null)}
        onTouchEnd={(e) => {
          if (startX == null) return;
          const dx = (e.changedTouches[0]?.clientX ?? 0) - startX;
          setStartX(null);
          if (Math.abs(dx) >= 40) go(dx < 0 ? index + 1 : index - 1);
        }}
      >
        <div
          className="flex transition-transform duration-300 ease-out"
          style={{ transform: `translateX(-${index * 100}%)` }}
        >
          {Array.from({ length: count }, (_, i) => (
            <div key={i} className="aspect-[4/5] w-full shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/crossview/${pairId}/card/${i}`}
                alt={`카드뉴스 ${i + 1}번째 컷`}
                loading={i === 0 ? "eager" : "lazy"}
                className="h-full w-full object-cover"
              />
            </div>
          ))}
        </div>

        {/* 좌우 이동 (데스크톱) — 잉크 테두리 원 */}
        {count > 1 && (
          <>
            {index > 0 && (
              <button
                type="button"
                onClick={() => go(index - 1)}
                aria-label="이전 카드"
                className="absolute left-2 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-foreground bg-background text-foreground md:flex"
              >
                ‹
              </button>
            )}
            {index < count - 1 && (
              <button
                type="button"
                onClick={() => go(index + 1)}
                aria-label="다음 카드"
                className="absolute right-2 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-foreground bg-background text-foreground md:flex"
              >
                ›
              </button>
            )}
            {/* 컷 카운터 — 검은 세계 사각 활자 */}
            <span className="absolute right-0 top-0 bg-foreground px-2 py-0.5 text-xs font-semibold tabular-nums text-background">
              {index + 1}/{count}
            </span>
          </>
        )}
      </div>

      {count > 1 && (
        <div className="flex items-center gap-2" role="group" aria-label="카드 이동">
          {Array.from({ length: count }, (_, i) => (
            <button
              key={i}
              type="button"
              aria-current={i === index}
              aria-label={`${i + 1}번째 카드`}
              onClick={() => setIndex(i)}
              className={`h-2.5 w-2.5 rounded-full ${
                i === index ? "bg-foreground" : "border border-foreground bg-transparent"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
