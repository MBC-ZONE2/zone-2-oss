// ============================================================================
// lib/auth/session — 현재 로그인 사용자 + 역할 추출
//
// 출처: deliverables/07-관리자-권한표.md §4 (역할 저장: app_metadata.role)
// Supabase Auth 세션을 읽어 인증 사용자와 AdminRole 을 반환한다.
// 세션 갱신은 middleware 가 담당하므로 여기서는 읽기만 한다.
// ============================================================================

import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  isAdminOrg,
  isAdminRole,
  orgFromRole,
  type AdminOrg,
  type AdminRole,
} from "./roles";

/** 인증된 관리자 사용자 (역할 + 소속 포함) */
export interface AdminUser {
  id: string;
  email: string | null;
  displayName: string;
  provider: string | null;
  role: AdminRole;
  /**
   * 이중 컨펌에서 이 사람이 대표하는 소속(회의 결정 [9]).
   * super_admin 은 null 이며 확인할 때 소속을 직접 고른다.
   */
  org: AdminOrg | null;
}

/**
 * 사용자 객체에서 역할을 추출한다.
 * app_metadata 는 service_role 만 수정할 수 있어 유일한 권한 신뢰 경계다.
 * user_metadata 는 사용자가 직접 수정할 수 있으므로 절대 역할에 사용하지 않는다.
 */
export function extractRole(user: User): AdminRole | null {
  const appRole = user.app_metadata?.role;
  return isAdminRole(appRole) ? appRole : null;
}

/**
 * 사용자 객체에서 소속(org)을 추출한다 — 역할과 같은 신뢰 경계(app_metadata).
 * app_metadata.org 가 비어 있으면 역할이 함축하는 소속으로 폴백한다
 * (operator_mbc → mbc, operator_oki → okinews). 계정 관리에서 org 를 채우기
 * 전의 기존 계정도 검수를 이어갈 수 있게 하기 위한 하위호환이다.
 */
export function extractOrg(user: User): AdminOrg | null {
  const appOrg = user.app_metadata?.org;
  if (isAdminOrg(appOrg)) return appOrg;
  const role = extractRole(user);
  return role ? orgFromRole(role) : null;
}

/** app_metadata.org 에 **명시적으로** 저장된 값만(폴백 없음) — 계정 관리 표시용 */
export function extractExplicitOrg(user: User): AdminOrg | null {
  const appOrg = user.app_metadata?.org;
  return isAdminOrg(appOrg) ? appOrg : null;
}

/** 카카오 등 소셜 프로필에서 화면 표시용 이름을 추출한다. */
export function extractNickname(user: User): string {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const candidates = [
    meta.name,
    meta.full_name,
    meta.nickname,
    meta.user_name,
    meta.preferred_username,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return user.email?.split("@")[0]?.trim() || "카카오 사용자";
}

/** 연결된 대표 OAuth 공급자. */
export function extractProvider(user: User): string | null {
  const provider = user.app_metadata?.provider;
  if (typeof provider === "string" && provider) return provider;
  const identityProvider = user.identities?.[0]?.provider;
  return typeof identityProvider === "string" ? identityProvider : null;
}

/**
 * 현재 요청의 인증 사용자를 반환한다 (역할 없이).
 * 미인증이면 null.
 *
 * 보안: getUser() 는 Auth 서버에 토큰을 검증한다(getSession 의 로컬 쿠키
 *       디코딩과 달리 신뢰 가능). 가드에서는 항상 이 함수를 사용한다.
 */
export async function getAuthUser(): Promise<User | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error) return null;
    return user ?? null;
  } catch (error) {
    // 쿠키/네트워크 문제 등 — 인증 실패로 처리한다.
    console.error("getAuthUser 실패:", error);
    return null;
  }
}

/**
 * ⚠️ 프리뷰 전용 인증 우회 (PREVIEW_NO_AUTH=1).
 * 소셜 로그인 미설정 상태에서 관리자·게이트 화면을 확인하기 위한 플래그다.
 * 프로덕션에서는 절대 설정하지 않는다 — 설정 시 누구나 최고관리자로 접근한다.
 */
function previewBypassUser(): AdminUser | null {
  // 운영 빌드에서는 플래그가 있어도 절대 우회하지 않는다(보안 검수 2026-10-26)
  if (process.env.NODE_ENV === "production") return null;
  if (process.env.PREVIEW_NO_AUTH !== "1") return null;
  return {
    id: "00000000-0000-0000-0000-000000000000",
    email: "preview@zone-2.local",
    displayName: "프리뷰 관리자",
    provider: null,
    role: "super_admin",
    org: null,
  };
}

/**
 * 현재 요청의 관리자 사용자(역할 포함)를 반환한다.
 * 미인증이거나 유효한 역할이 없으면 null.
 */
export async function getAdminUser(): Promise<AdminUser | null> {
  const bypass = previewBypassUser();
  if (bypass) return bypass;

  const user = await getAuthUser();
  if (!user) return null;

  const role = extractRole(user);
  if (!role) return null;

  return {
    id: user.id,
    email: user.email ?? null,
    displayName: extractNickname(user),
    provider: extractProvider(user),
    role,
    org: extractOrg(user),
  };
}
