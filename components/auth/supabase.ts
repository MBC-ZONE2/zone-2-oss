"use client";

// ============================================================================
// components/auth/supabase — 브라우저 Supabase 클라이언트 (키 미설정 안전)
//
// F6 는 카카오·네이버 키 도착 전 선작업이므로, env 미설정 시 클라이언트 생성이
// throw 하지 않도록 null 을 반환한다(버튼은 배선되되 실 로그인은 키 주입 후).
// ============================================================================

import { createBrowserClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Supabase(Auth) 설정 여부 — 키가 모두 있어야 true */
export const isAuthConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON);

/** 브라우저 클라이언트. 미설정이면 null(호출측이 안내 토스트 처리). */
export function getBrowserClient() {
  if (!SUPABASE_URL || !SUPABASE_ANON) return null;
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON);
}

/**
 * 소셜 프로필에서 표시용 닉네임을 추출한다 (서버 extractNickname 과 동일 규칙).
 * 클라이언트 전용(로그인 상태 표시·실명 미리보기).
 */
export function userNickname(user: User | null): string {
  if (!user) return "";
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
  return emailLocal || "이용자";
}
