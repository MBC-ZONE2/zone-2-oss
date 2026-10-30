// ============================================================================
// lib/forum/api — 라우트 핸들러 공용 헬퍼 (응답 규약 + 인증)
//
// 담당: 통합 공론장(그룹 D).
// 응답 규약(docs/06 §2): { data, error } — 성공 시 error:null, 실패 시 data:null.
// ============================================================================

import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import type { ApiError, ApiResponse } from "@/types";
import { createClient } from "@/lib/supabase/server";

/** 성공 응답 */
export function ok<T>(data: T, status = 200): NextResponse<ApiResponse<T>> {
  return NextResponse.json({ data, error: null }, { status });
}

/** 에러 응답 */
export function fail(
  code: string,
  message: string,
  status: number,
): NextResponse<ApiResponse<never>> {
  const error: ApiError = { code, message };
  return NextResponse.json({ data: null, error }, { status });
}

/** 자주 쓰는 에러 단축 */
export const errors = {
  unauthorized: () =>
    fail("UNAUTHORIZED", "로그인이 필요합니다", 401),
  notFound: (message = "대상을 찾을 수 없습니다") =>
    fail("NOT_FOUND", message, 404),
  validation: (message: string) => fail("VALIDATION_ERROR", message, 400),
  forbidden: (message = "비밀번호가 일치하지 않습니다") =>
    fail("FORBIDDEN", message, 403),
  rateLimited: (message = "잠시 후 다시 시도해 주세요") =>
    fail("RATE_LIMITED", message, 429),
  badJson: () => fail("BAD_REQUEST", "요청 본문(JSON)이 올바르지 않습니다", 400),
  internal: () => fail("INTERNAL_ERROR", "서버 오류가 발생했습니다", 500),
} as const;

/** 인증 결과 */
export interface AuthContext {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  user: User;
}

/**
 * 현재 세션의 인증 사용자를 확인한다.
 * 인증 안됨이면 null(호출측에서 errors.unauthorized()).
 */
export async function requireUser(): Promise<AuthContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return { supabase, userId: user.id, user };
}

/**
 * 소셜 프로필에서 실명(닉네임)을 추출한다 (F6 실명 선택 시).
 * 카카오/네이버가 user_metadata 로 넘기는 이름 후보를 순서대로 확인하고,
 * 없으면 이메일 앞부분 → 최종 폴백 "이용자". 서버에서만 신뢰(클라 입력 아님).
 */
export function extractNickname(user: User): string {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const candidates = [
    meta.name,
    meta.full_name,
    meta.nickname,
    meta.user_name,
    meta.preferred_username,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim().length > 0) return c.trim();
  }
  const emailLocal = user.email?.split("@")[0]?.trim();
  if (emailLocal) return emailLocal;
  return "이용자";
}
