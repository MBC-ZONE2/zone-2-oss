"use client";

// ============================================================================
// components/forum/my-ink-dot — 내 글 옆 잉크 점
//
// localStorage(my-posts)에 id 가 있으면 제목 옆에 12px 잉크 점이 날아와 앉는다
// (300ms, reduced-motion 이면 즉시). 없으면 아무것도 그리지 않는다.
// ============================================================================

import { useEffect, useState } from "react";
import { useIsMyPost } from "./my-posts";

export function MyInkDot({ postId }: { postId: string }) {
  const mine = useIsMyPost(postId);
  const [landed, setLanded] = useState(false);

  // 마운트 다음 프레임에 .is-landed → transform/opacity 전환으로 "앉는다"
  useEffect(() => {
    if (!mine) return undefined;
    const raf = requestAnimationFrame(() => setLanded(true));
    return () => cancelAnimationFrame(raf);
  }, [mine]);

  if (!mine) return null;
  return (
    <span
      role="img"
      aria-label="내가 쓴 글"
      title="내가 쓴 글"
      className={landed ? "fo-mine is-landed" : "fo-mine"}
    />
  );
}
