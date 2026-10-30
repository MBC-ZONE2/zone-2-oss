// ============================================================================
// components/ui/skeleton — 로딩 스켈레톤 (shimmer)
//
// 데이터 로딩 중 플레이스홀더. 좌→우로 흐르는 shimmer 그라데이션을 사용한다.
// prefers-reduced-motion 시 globals.css 규칙으로 애니메이션이 사실상 정지한다.
// (기존 export 시그니처 유지 — className 으로 크기를 지정한다.)
// ============================================================================

import * as React from "react";
import { cn } from "@/lib/utils";

/** 로딩 스켈레톤. 크기는 className 으로 지정한다. */
export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn(
        "animate-shimmer rounded-md",
        "bg-[linear-gradient(90deg,var(--sk-base)_25%,var(--sk-highlight)_37%,var(--sk-base)_63%)]",
        "bg-[length:400%_100%]",
        className,
      )}
      {...props}
    />
  );
}
