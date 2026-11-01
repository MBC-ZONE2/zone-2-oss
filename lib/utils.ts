// ============================================================================
// lib/utils — 공통 유틸리티
//
// cn(): clsx 로 조건부 클래스를 결합하고 tailwind-merge 로 충돌 클래스를 병합한다
// (예: "px-2 px-4" → "px-4"). shadcn/ui 표준 패턴. 기존 호출부 시그니처는 동일.
// ============================================================================

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** clsx 의 ClassValue 를 재노출 (기존 타입 호환) */
export type { ClassValue };

/** 조건부 className 결합 + Tailwind 충돌 병합 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
