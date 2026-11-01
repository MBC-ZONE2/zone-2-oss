"use client";

// ============================================================================
// app/admin/_components/password-change-form — 내 계정 화면의 비밀번호 변경 (「일점 지면」)
//
// 현재 비밀번호 → 새 비밀번호 → 확인 세 칸. POST /api/admin/account/password 가 현재
// 비밀번호를 검증한 뒤 바꾼다. 성공하면 칸을 비우고 한 줄로 알린다. 이메일 계정이 아니면
// 부모(account/page)가 이 폼을 아예 그리지 않는다.
// ============================================================================

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";

const MIN = 8;

export function PasswordChangeForm() {
  const uid = useId();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const mismatch = confirm.length > 0 && next !== confirm;
  const tooShort = next.length > 0 && next.length < MIN;
  const ready = current.length > 0 && next.length >= MIN && next === confirm && !pending;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setPending(true);
    setError(null);
    setDone(false);
    try {
      const res = await fetch("/api/admin/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const json = (await res.json()) as { error?: { message?: string } | null };
      if (!res.ok || json.error) {
        setError(json.error?.message ?? "비밀번호를 바꾸지 못했습니다.");
        return;
      }
      setCurrent("");
      setNext("");
      setConfirm("");
      setDone(true);
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="ad-form" onSubmit={onSubmit} noValidate>
      {error && (
        <p role="alert" className="ad-error">
          {error}
        </p>
      )}
      {done && (
        <p role="status" className="ad-hint">
          비밀번호를 바꿨습니다. 다음 로그인부터 새 비밀번호를 씁니다.
        </p>
      )}
      <label htmlFor={`${uid}-cur`}>
        현재 비밀번호
        <input
          id={`${uid}-cur`}
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          className="ad-field"
          required
        />
      </label>
      <label htmlFor={`${uid}-new`}>
        {`새 비밀번호 (${MIN}자 이상)`}
        <input
          id={`${uid}-new`}
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          className="ad-field"
          aria-invalid={tooShort || undefined}
          required
        />
      </label>
      <label htmlFor={`${uid}-confirm`}>
        새 비밀번호 확인
        <input
          id={`${uid}-confirm`}
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="ad-field"
          aria-invalid={mismatch || undefined}
          required
        />
        {mismatch && <span style={{ color: "var(--ad-red)", fontWeight: 500 }}>두 칸이 서로 다릅니다.</span>}
        {tooShort && !mismatch && (
          <span style={{ color: "var(--ad-red)", fontWeight: 500 }}>{MIN}자 이상으로 해 주세요.</span>
        )}
      </label>
      <div>
        <Button type="submit" size="sm" disabled={!ready}>
          {pending ? "바꾸는 중…" : "비밀번호 바꾸기"}
        </Button>
      </div>
    </form>
  );
}
