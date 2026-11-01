// ============================================================================
// components/ui/badge — 기본 배지 (Tailwind, 직접 작성)
//
// shadcn 미사용. 상태/라벨 표시용.
// 「일점 지면」: 배지는 면이 아니라 활자다 — 대문자 12px, 자간 .14em, 라운드 0.
//   - default  : 잉크 활자
//   - secondary: 보조 잉크(#5b6170) 활자
//   - outline  : 잉크 괘선 1px 안의 활자(면 없음)
// variant 시그니처는 기존 호출부 호환을 위해 유지한다.
// ============================================================================

import * as React from "react";
import { cn } from "@/lib/utils";

export type BadgeVariant = "default" | "secondary" | "outline";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  default: "text-foreground",
  secondary: "text-muted-foreground",
  outline: "border border-line px-1.5 py-px text-foreground",
};

/** 기본 배지. variant 로 스타일을 조절한다. */
export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-none text-[12px] font-medium uppercase leading-[1.6] tracking-[0.14em]",
        VARIANT_CLASSES[variant],
        className,
      )}
      {...props}
    />
  );
}
