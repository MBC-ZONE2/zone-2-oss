"use client";

// ============================================================================
// components/ui/dialog — 모달 다이얼로그 (Radix Dialog 기반)
//
// 「일점 지면」: 라운드 0, 종이 단색, 그림자·유리 없음, 상단 2px 잉크 괘선.
// 신고/삭제 확인 등에서 사용한다. 접근성은 Radix 가 보장.
// ============================================================================

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export const DialogPortal = DialogPrimitive.Portal;

/** 오버레이 — 검은 세계 단색(반투명), 블러 없음. 페이드 인/아웃 */
export const DialogOverlay = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-[#0b0d12]/70",
      "data-[state=open]:animate-[zone2-fade-in_0.2s_ease-out]",
      "data-[state=closed]:animate-[zone2-fade-out_0.2s_ease-in]",
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = "DialogOverlay";

/** 중앙 모달 콘텐츠 — 괘선 블록 */
export const DialogContent = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2",
        "flex flex-col gap-5 rounded-none border border-t-2 border-line bg-background p-6 text-foreground shadow-none",
        "data-[state=open]:animate-[zone2-dialog-in_0.22s_ease-out]",
        "data-[state=closed]:animate-[zone2-fade-out_0.18s_ease-in]",
        "focus:outline-none",
        className,
      )}
      {...props}
    >
      {children}
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = "DialogContent";

/** 헤더(제목+설명 묶음) */
export function DialogHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1.5", className)} {...props} />;
}

/** 하단 액션 버튼 영역 — 상단 1px 괘선 위에 버튼을 둔다 */
export function DialogFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    />
  );
}

export const DialogTitle = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "text-[20px] font-bold leading-tight tracking-[-0.01em] text-foreground sm:text-[22px]",
      className,
    )}
    {...props}
  />
));
DialogTitle.displayName = "DialogTitle";

export const DialogDescription = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-[17px] leading-[1.65] text-muted-foreground", className)}
    {...props}
  />
));
DialogDescription.displayName = "DialogDescription";
