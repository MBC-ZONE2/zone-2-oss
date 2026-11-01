// ============================================================================
// lib/temperature/http — 온도계 API 응답 헬퍼
//
// docs/06 §2 공통 규약: { data, error } — 성공 시 error: null.
// 공용 타입 ApiResponse<T> (types/index.ts) 를 그대로 사용한다.
// ============================================================================

import { NextResponse } from "next/server";
import type { ApiError, ApiResponse } from "@/types";

/** 성공 응답 — { data, error: null } */
export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  const body: ApiResponse<T> = { data, error: null };
  return NextResponse.json(body, init);
}

/** 에러 응답 — { data: null, error: { code, message } } */
export function fail(
  status: number,
  code: string,
  message: string,
): NextResponse {
  const error: ApiError = { code, message };
  const body: ApiResponse<never> = { data: null, error };
  return NextResponse.json(body, { status });
}
