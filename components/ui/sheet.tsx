"use client";

// ============================================================================
// components/ui/sheet — 바텀시트 / 모달 (Radix Dialog 기반)
//
// 모바일: 하단에서 슬라이드업. 데스크탑(sm+): 중앙 모달로 표시.
// 「일점 지면」: 라운드 0, 종이 단색, 그림자·유리 없음, 상단 2px 잉크 괘선.
// 드래그 핸들(라운드 필)은 없다 — 괘선이 곧 모서리다. 접근성은 Radix 가 보장.
// ============================================================================

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";

export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;

/** 오버레이 — 검은 세계 단색(반투명), 블러 없음 */
const SheetOverlay = React.forwardRef<
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
SheetOverlay.displayName = "SheetOverlay";

/**
 * 바텀시트 콘텐츠.
 * 모바일: 화면 하단 고정 + 슬라이드업. sm+: 중앙 정렬 모달 + 페이드.
 */
export const SheetContent = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <SheetOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        // 모바일: 하단 고정, 상단 2px 잉크 괘선, 종이 단색
        "fixed inset-x-0 bottom-0 z-50 flex flex-col gap-5 rounded-none border-t-2 border-line bg-background p-5 pb-8 text-foreground shadow-none",
        "data-[state=open]:animate-[zone2-sheet-up_0.28s_cubic-bezier(0.32,0.72,0,1)]",
        "data-[state=closed]:animate-[zone2-sheet-down_0.2s_ease-in]",
        // 데스크탑: 중앙 모달 — 상단 2px 괘선 + 나머지 1px 괘선
        "sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[calc(100%-2rem)] sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-none sm:border sm:border-t-2 sm:p-6 sm:pb-6",
        "sm:data-[state=open]:animate-[zone2-dialog-in_0.22s_ease-out]",
        "sm:data-[state=closed]:animate-[zone2-fade-out_0.18s_ease-in]",
        "focus:outline-none",
        className,
      )}
      style={{ paddingBottom: "max(2rem, env(safe-area-inset-bottom))" }}
      {...props}
    >
      {children}
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
SheetContent.displayName = "SheetContent";

/** 헤더(제목+설명) — 좌정렬 예외 없음 */
export function SheetHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex flex-col gap-1.5 text-left", className)}
      {...props}
    />
  );
}

export const SheetTitle = React.forwardRef<
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
SheetTitle.displayName = "SheetTitle";

export const SheetDescription = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-[17px] leading-[1.65] text-muted-foreground", className)}
    {...props}
  />
));
SheetDescription.displayName = "SheetDescription";
