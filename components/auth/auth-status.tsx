"use client";

// ============================================================================
// components/auth/auth-status — 헤더 로그인 상태 위젯
//
// 비로그인: "로그인" 링크(/login, 현재 경로 복귀). 로그인: 닉네임 + 로그아웃.
// onAuthStateChange 구독(useAuth)으로 상태를 실시간 반영한다.
// ============================================================================

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "./use-auth";
import { getBrowserClient, userNickname } from "./supabase";

const LINK_CLASS = cn(
  "inline-flex min-h-11 items-center rounded-md px-3 text-sm font-semibold",
  "text-action transition-colors hover:bg-surface-muted hover:text-action-hover",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
);

/** 헤더 우측 로그인 상태 표시 */
export function AuthStatus() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const [signingOut, setSigningOut] = useState(false);

  if (loading) {
    return (
      <div
        className="h-9 w-16 animate-pulse rounded-md bg-line"
        aria-hidden
      />
    );
  }

  if (!user) {
    const next = pathname.startsWith("/login")
      ? "/login"
      : `/login?redirect=${encodeURIComponent(pathname)}`;
    return (
      <Link href={next} className={LINK_CLASS}>
        로그인
      </Link>
    );
  }

  async function signOut() {
    const supabase = getBrowserClient();
    if (!supabase) return;
    setSigningOut(true);
    await supabase.auth.signOut();
    setSigningOut(false);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-1.5">
      <span
        className="hidden max-w-[8rem] truncate text-sm font-semibold text-foreground sm:inline"
        title={userNickname(user)}
      >
        {userNickname(user)}
      </span>
      <button
        type="button"
        onClick={signOut}
        disabled={signingOut}
        className={cn(
          "inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium",
          "text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
          "disabled:opacity-60",
        )}
      >
        로그아웃
      </button>
    </div>
  );
}
