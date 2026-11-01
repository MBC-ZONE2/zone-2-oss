// ============================================================================
// lib/auth/guard — Route Handler 역할 가드
//
// 출처: docs/06-API명세.md §2 (관리자 인증: Supabase Auth 세션 + role)
//       deliverables/07-관리자-권한표.md §2 (권한 매트릭스)
//
// 관리자 API 핸들러는 먼저 requirePermission() 으로 인증/권한을 확인한다.
// 성공 시 AdminUser 를, 실패 시 즉시 반환할 NextResponse(JSON 에러)를 돌려준다.
// ============================================================================

import { NextResponse } from "next/server";
import type { ApiError, ApiResponse } from "@/types";
import { getAdminUser, type AdminUser } from "./session";
import { roleHasPermission, type Permission } from "./roles";

/** 표준 에러 응답({ data:null, error }) 을 적절한 상태코드로 생성한다. */
export function errorResponse(
  status: number,
  code: string,
  message: string,
): NextResponse<ApiResponse<never>> {
  const error: ApiError = { code, message };
  return NextResponse.json({ data: null, error }, { status });
}

/** 표준 성공 응답({ data, error:null }) 을 생성한다. */
export function okResponse<T>(
  data: T,
  status = 200,
): NextResponse<ApiResponse<T>> {
  return NextResponse.json({ data, error: null }, { status });
}

/**
 * 가드 결과: 통과 시 user, 실패 시 즉시 반환할 response.
 * 호출부에서 `if ("response" in result) return result.response;` 패턴으로 사용.
 */
export type GuardResult =
  | { user: AdminUser; response?: undefined }
  | { user?: undefined; response: NextResponse<ApiResponse<never>> };

/**
 * 인증만 요구한다 (역할 무관, 유효한 AdminRole 보유 필요).
 * @returns 인증 사용자 또는 401 응답
 */
export async function requireAuth(): Promise<GuardResult> {
  const user = await getAdminUser();
  if (!user) {
    return {
      response: errorResponse(
        401,
        "UNAUTHORIZED",
        "로그인이 필요합니다.",
      ),
    };
  }
  return { user };
}

/**
 * 특정 권한을 요구한다.
 * @returns 권한 보유 사용자, 또는 401(미인증)/403(권한없음) 응답
 */
export async function requirePermission(
  permission: Permission,
): Promise<GuardResult> {
  const result = await requireAuth();
  if (result.response) return result;

  if (!roleHasPermission(result.user.role, permission)) {
    return {
      response: errorResponse(
        403,
        "FORBIDDEN",
        "이 작업을 수행할 권한이 없습니다.",
      ),
    };
  }
  return { user: result.user };
}
