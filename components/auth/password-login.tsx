"use client";

// ============================================================================
// components/auth/password-login — 관리자 이메일·비밀번호 로그인 폼
//
// 카카오 OAuth 와 병행하는 자격증명 로그인. signInWithPassword 로 세션 쿠키를
// 심은 뒤(@supabase/ssr) 전체 페이지 이동으로 서버가 쿠키를 읽게 한다.
// 권한은 여전히 app_metadata.role 이 SSOT(로그인만으로 관리자 아님).
// ============================================================================

import { useState } from "react";
import { getBrowserClient } from "./supabase";

export function PasswordLogin({ redirectTo = "/admin" }: { redirectTo?: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const supabase = getBrowserClient();
    if (!supabase) {
      setError("인증이 아직 설정되지 않았습니다.");
      return;
    }

    setPending(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (signInError) {
      setError("이메일 또는 비밀번호가 올바르지 않습니다.");
      setPending(false);
      return;
    }
    // 세션 쿠키 반영 후 서버 가드가 역할을 읽도록 전체 이동.
    window.location.assign(redirectTo);
  }

  return (
    <form onSubmit={onSubmit} className="ad-form">
      {error && (
        <p role="alert" className="ad-error">
          {error}
        </p>
      )}
      <label>
        이메일
        <input
          type="email"
          name="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="ad-field"
          placeholder="name@example.org"
        />
      </label>
      <label>
        비밀번호
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="ad-field"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-12 items-center justify-center border border-foreground bg-foreground px-4 text-[17px] font-bold text-background disabled:opacity-60"
      >
        {pending ? "로그인 중…" : "이메일로 로그인"}
      </button>
    </form>
  );
}
