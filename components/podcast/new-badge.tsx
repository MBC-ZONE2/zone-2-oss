"use client";

// ============================================================================
// components/podcast/new-badge — NEW 표기 (FR-PC-01)
//
// publishedAt 이 72시간 이내면 표시하고, 72h 경과 시 자동 소멸한다.
// 현재 시각 기준 계산이라 SSR/CSR 결과가 어긋날 수 있어, 마운트 후(클라이언트)
// 에만 판정해 하이드레이션 불일치를 피한다. 면 없는 잉크 활자(700)로 찍는다.
// ============================================================================

import { useEffect, useState } from "react";
import { isWithin72Hours } from "./format";

export interface NewBadgeProps {
  publishedAt: string | null | undefined;
}

/** 72시간 이내 발행 시에만 렌더되는 NEW 활자 */
export function NewBadge({ publishedAt }: NewBadgeProps) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    setShow(isWithin72Hours(publishedAt));

    // 페이지를 열어둔 채 만료 시점이 지나도 자동 소멸하도록 타이머 예약
    // (교차리뷰 반영). 72h 는 setTimeout 최대치(약 24.8일) 이내라 안전.
    if (!publishedAt) return;
    const expiry = Date.parse(publishedAt) + 72 * 60 * 60 * 1000;
    const remaining = expiry - Date.now();
    if (!Number.isFinite(remaining) || remaining <= 0) return;
    const timer = setTimeout(() => setShow(false), remaining);
    return () => clearTimeout(timer);
  }, [publishedAt]);

  if (!show) return null;

  return (
    <>
      <span className="pc-sep" aria-hidden>
        ·
      </span>
      <span className="pc-new">NEW</span>
    </>
  );
}
