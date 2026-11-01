"use client";

// ============================================================================
// components/auth/login-prompt — 로그인 유도 바텀시트 + 컨텍스트
//
// 비로그인 상태에서 작성·좋아요·신고를 시도하면 promptLogin() 으로 하단
// 슬라이드업(모바일)/모달(데스크탑) 시트를 띄운다. 현재 경로를 복귀 대상으로 전달.
// ============================================================================

import { createContext, useCallback, useContext, useState } from "react";
import { usePathname } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { SocialButtons } from "./social-buttons";
import { useAuth } from "./use-auth";

interface LoginPromptValue {
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  /** 로그인 유도 시트를 연다 */
  promptLogin: () => void;
}

const LoginPromptContext = createContext<LoginPromptValue | null>(null);

/** 공론장 인터랙션 트리를 감싸 로그인 상태 + 유도 시트를 제공한다 */
export function LoginPromptProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const [open, setOpen] = useState(false);
  const pathname = usePathname() ?? "/forum";

  const promptLogin = useCallback(() => setOpen(true), []);

  return (
    <LoginPromptContext.Provider
      value={{ user, loading, isAuthenticated: Boolean(user), promptLogin }}
    >
      {children}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle className="font-display font-semibold">
              로그인하고 의견을 남겨 보세요
            </SheetTitle>
            <SheetDescription>
              글쓰기·댓글·좋아요·신고는 로그인 후 이용할 수 있습니다. 소셜 계정으로
              간편하게 시작하세요.
            </SheetDescription>
          </SheetHeader>

          {/* 에디토리얼 톤: 안내(muted)와 소셜 버튼 사이를 헤어라인으로 구분 */}
          <div className="h-px w-full bg-line" aria-hidden />

          <SocialButtons redirectTo={pathname} />

          <p className="text-center text-xs leading-relaxed text-muted-foreground">
            로그인하면 이용약관과 개인정보처리방침에 동의하는 것으로 간주됩니다.
          </p>
        </SheetContent>
      </Sheet>
    </LoginPromptContext.Provider>
  );
}

/** 로그인 상태 + promptLogin 접근 훅 (Provider 하위에서만) */
export function useLoginPrompt(): LoginPromptValue {
  const value = useContext(LoginPromptContext);
  if (!value) {
    throw new Error("useLoginPrompt 는 LoginPromptProvider 안에서 사용해야 합니다");
  }
  return value;
}
