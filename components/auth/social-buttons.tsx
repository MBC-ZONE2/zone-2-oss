"use client";

// ============================================================================
// components/auth/social-buttons — 카카오 / 네이버 로그인 버튼
//
// 브랜드 가이드 색: 카카오 #FEE500(검정 텍스트) · 네이버 #03C75A(흰 텍스트).
// signInWithOAuth 로 콜백(/auth/callback?redirect=)을 지정한다. 키 미설정/실패
// 시 "로그인 준비 중입니다" 토스트(REQ-012 키 도착 전 선작업 — 버튼만 배선).
// ============================================================================

import { useState } from "react";
import type { Provider } from "@supabase/supabase-js";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/sonner";
import { getBrowserClient } from "./supabase";

export type SocialProvider = "kakao" | "naver";

interface ProviderConfig {
  id: SocialProvider;
  label: string;
  className: string;
  Icon: () => React.ReactElement;
}

/** 카카오 말풍선 아이콘 */
function KakaoIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
      <path d="M12 3C6.9 3 3 6.3 3 10.3c0 2.6 1.7 4.9 4.3 6.2-.2.7-.7 2.5-.8 2.9 0 0 0 .3.2.4.1.1.3 0 .3 0 .5-.1 3-2 3.6-2.4.4.1.9.1 1.4.1 5.1 0 9-3.3 9-7.3S17.1 3 12 3Z" />
    </svg>
  );
}

/** 네이버 N 아이콘 */
function NaverIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
      <path d="M14.2 12.1 9.5 5H5v14h4.8v-7.1L14.5 19H19V5h-4.8v7.1Z" />
    </svg>
  );
}

const PROVIDERS: ProviderConfig[] = [
  {
    id: "kakao",
    label: "카카오로 계속하기",
    className: "bg-[#FEE500] text-black hover:brightness-95",
    Icon: KakaoIcon,
  },
  {
    id: "naver",
    label: "네이버로 계속하기",
    className: "bg-[#03C75A] text-white hover:brightness-95",
    Icon: NaverIcon,
  },
];

/**
 * @param redirectTo 로그인 후 복귀할 내부 경로(기본 /forum)
 */
export function SocialButtons({
  redirectTo = "/forum",
  // 운영 방침(2026-08-03 정기회의): 사용자 로그인은 **카카오 + 네이버 2종**.
  // 구글은 카카오톡 인앱브라우저 정책상 링크 공유 시 로그인 자체가 차단되어 제외한다
  // (이 판단 근거는 중간보고서에 기록하기로 회의에서 결정).
  providers = ["kakao", "naver"],
}: {
  redirectTo?: string;
  providers?: readonly SocialProvider[];
}) {
  const [pending, setPending] = useState<SocialProvider | null>(null);

  async function signIn(provider: SocialProvider) {
    const supabase = getBrowserClient();
    if (!supabase) {
      toast("로그인 준비 중입니다", {
        description: "소셜 로그인 연동을 준비 중입니다. 곧 이용할 수 있어요.",
      });
      return;
    }

    setPending(provider);
    try {
      const callback = `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(redirectTo)}`;
      const { error } = await supabase.auth.signInWithOAuth({
        // 네이버는 Supabase Custom OAuth Provider (타입 유니온 외) → 캐스팅.
        provider: provider as Provider,
        options: { redirectTo: callback },
      });
      if (error) {
        toast("로그인 준비 중입니다", {
          description: "잠시 후 다시 시도해 주세요.",
        });
        setPending(null);
      }
      // 성공 시 프로바이더 페이지로 자동 이동한다(상태 유지).
    } catch {
      toast("로그인 준비 중입니다", {
        description: "잠시 후 다시 시도해 주세요.",
      });
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {PROVIDERS.filter(({ id }) => providers.includes(id)).map(
        ({ id, label, className, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => signIn(id)}
            disabled={pending !== null}
            aria-busy={pending === id}
            aria-label={label}
            className={cn(
              "inline-flex min-h-12 items-center justify-center gap-2.5 rounded-xl px-4 text-body font-bold",
              "transition-[filter,opacity] disabled:opacity-60",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
              className,
            )}
          >
            <Icon />
            <span>{pending === id ? "연결 중…" : label}</span>
          </button>
        ),
      )}
    </div>
  );
}
