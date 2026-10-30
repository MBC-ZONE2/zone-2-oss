"use client";

// ============================================================================
// components/forum/relative-time — 상대 시간 표시 (예: "3분 전")
//
// 서버/클라 hydration 불일치를 피하려고 마운트 후 클라이언트에서 계산한다.
// 마운트 전에는 ISO 날짜의 'YYYY-MM-DD' 만 보여준다. 색은 부모(메타 활자)를 따른다.
// ============================================================================

import { useEffect, useState } from "react";

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffSec = Math.round((Date.now() - then) / 1000);

  if (diffSec < 60) return "방금 전";
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `${min}분 전`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour}시간 전`;
  const day = Math.floor(hour / 24);
  if (day < 7) return `${day}일 전`;

  return new Date(iso).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** createdAt(ISO) → 상대 시간. dateTime 속성으로 원본도 노출. */
export function RelativeTime({ iso }: { iso: string }) {
  const [label, setLabel] = useState(() => iso.slice(0, 10));

  useEffect(() => {
    setLabel(formatRelative(iso));
  }, [iso]);

  return <time dateTime={iso}>{label}</time>;
}
