"use client";

// ============================================================================
// components/auth/use-auth — 현재 로그인 사용자 구독 훅
//
// 마운트 시 getUser() 로 초기값을 읽고 onAuthStateChange 로 변경을 구독한다.
// 키 미설정(getBrowserClient()===null)이면 비로그인 상태로 즉시 확정한다.
// ============================================================================

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { getBrowserClient } from "./supabase";

export interface AuthState {
  user: User | null;
  loading: boolean;
}

/** 현재 인증 사용자 + 로딩 상태 */
export function useAuth(): AuthState {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = getBrowserClient();
    if (!supabase) {
      setLoading(false);
      return;
    }

    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      setUser(data.user ?? null);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { user, loading };
}
