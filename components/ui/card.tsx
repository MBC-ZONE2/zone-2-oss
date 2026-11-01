// ============================================================================
// components/ui/card — 괘선 블록 (Tailwind, 직접 작성)
//
// shadcn 미사용. Card / CardHeader / CardContent 를 제공한다.
// 「일점 지면」: 카드(라운드·그림자·면)는 폐기하고 상단 1px 괘선으로 시작하는
// 블록으로 둔다. 바닥은 종이 그대로.
//   - variant="default": 종이 바닥 + 상단 괘선
//   - variant="plain"  : 투명 바닥 + 상단 괘선 (지면 위 구획용)
// 기존 호출부는 variant 미지정 → default 로 동작(시그니처 하위호환).
// ============================================================================

import * as React from "react";
import { cn } from "@/lib/utils";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "plain";
}

/** 괘선 블록 컨테이너 (상단 1px 잉크 괘선, 라운드·그림자 없음) */
export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = "default", ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "rounded-none border-t border-line text-foreground",
        variant === "default" && "bg-background",
        variant === "plain" && "bg-transparent",
        className,
      )}
      {...props}
    />
  ),
);
Card.displayName = "Card";

/** 블록 헤더 — 제목/설명 영역 */
export const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col gap-1.5 px-0 py-5", className)}
    {...props}
  />
));
CardHeader.displayName = "CardHeader";

/** 블록 본문 */
export const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("px-0 pb-5", className)} {...props} />
));
CardContent.displayName = "CardContent";
