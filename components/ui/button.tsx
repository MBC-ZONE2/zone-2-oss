// ============================================================================
// components/ui/button — 기본 버튼 (Tailwind, 직접 작성)
//
// shadcn 미사용. globals.css 의 디자인 토큰(background/foreground)을 사용한다.
// 「일점 지면」: 라운드 0, 활자 17px 700, 높이 44px 이상, 그림자·트랜지션 없음.
//   - primary  : 잉크 채움 + 종이 활자
//   - secondary: 잉크 테두리 1px(면 없음)
//   - outline  : 잉크 테두리 1px(secondary 와 같은 문법 — 기존 호출부 호환)
//   - ghost    : 활자만(hover 밑줄)
// variant/size 시그니처는 유지한다. size 는 높이만 다르고 모두 44px 이상이다.
// ============================================================================

import * as React from "react";
import { cn } from "@/lib/utils";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "border border-foreground bg-foreground text-background hover:bg-action-hover hover:border-action-hover",
  secondary: "border border-foreground bg-transparent text-foreground hover:underline hover:underline-offset-4",
  outline: "border border-foreground bg-transparent text-foreground hover:underline hover:underline-offset-4",
  ghost: "border border-transparent bg-transparent text-foreground hover:underline hover:underline-offset-4",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "min-h-11 px-4 text-[15px]",
  md: "min-h-12 px-5 text-[17px]",
  lg: "min-h-14 px-6 text-[17px]",
};

/** 기본 버튼. variant / size 로 스타일을 조절한다. */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", type, ...props }, ref) => {
    return (
      <button
        ref={ref}
        type={type ?? "button"}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-none font-bold leading-none",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground",
          "disabled:pointer-events-none disabled:opacity-50",
          VARIANT_CLASSES[variant],
          SIZE_CLASSES[size],
          className,
        )}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";
