// ============================================================================
// /login — 소셜 로그인 (카카오)
//
// 서비스 한 줄 소개 + 카카오 로그인 버튼 + 둘러보기(게스트) 링크. redirect 쿼리로
// 로그인 후 원래 페이지 복귀. 콜백 실패 시 ?error=auth 로 안내를 노출한다.
// (운영 방침: 사용자 로그인은 카카오톡만 사용 — 네이버는 보류)
// ============================================================================

import type { Metadata } from "next";
import Link from "next/link";
import { SocialButtons } from "@/components/auth/social-buttons";
import { region } from "@/config/region";

export const metadata: Metadata = {
  title: "로그인", // layout template 이 " · ZONE-2" 를 붙인다
  description: `카카오로 ${region.site.name} 공론장에 참여하세요.`,
};

/** 내부 경로만 복귀 대상으로 허용 */
function safePath(raw?: string): string {
  if (raw && raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return "/forum";
}

interface LoginPageProps {
  searchParams: Promise<{ redirect?: string; error?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const sp = await searchParams;
  const redirectTo = safePath(sp.redirect);
  const hasError = sp.error === "auth";

  return (
    <main className="mx-auto flex min-h-[calc(100vh-3.5rem)] w-full max-w-md flex-col justify-center gap-8 px-6 py-16">
      <header className="flex flex-col items-center gap-2 border-b-2 border-foreground pb-6 text-center">
        <span className="font-display text-display font-black tracking-tight text-brand">
          {region.site.name}
        </span>
        <p className="text-[11px] font-medium tracking-[0.1em] text-muted-foreground">
          광역과 기초, 두 시선으로 보는 지역 공론
        </p>
      </header>

      {hasError && (
        <p
          role="alert"
          className="rounded-lg border border-danger/30 bg-danger-bg px-4 py-3 text-sm font-medium text-danger"
        >
          로그인에 실패했습니다. 다시 시도해 주세요.
        </p>
      )}

      <section aria-label="소셜 로그인" className="flex flex-col gap-4">
        <SocialButtons redirectTo={redirectTo} />
        <p className="text-center text-xs leading-relaxed text-muted-foreground">
          로그인하면 이용약관과 개인정보처리방침에 동의하는 것으로 간주됩니다.
        </p>
      </section>

      <div className="flex items-center justify-center gap-3 text-sm text-muted-foreground">
        <span className="h-px w-8 bg-line" aria-hidden />
        <span>또는</span>
        <span className="h-px w-8 bg-line" aria-hidden />
      </div>

      <Link
        href="/forum"
        className="inline-flex min-h-11 items-center justify-center rounded-xl border border-line px-4 text-sm font-semibold text-foreground transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        로그인 없이 둘러보기
      </Link>
    </main>
  );
}
