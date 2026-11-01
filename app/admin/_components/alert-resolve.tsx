"use client";

// 시스템 경고 "확인" 버튼 — POST /api/admin/alerts/resolve 뒤 서버 컴포넌트를 다시 그린다(#189).
// id 가 있으면 한 건, all="info" 면 알림성 전부. 실패하면 버튼 옆에 짧게 사유.

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AlertResolveButton({ id, all, label, name }: { id?: string; all?: "info"; label: string; name?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const onClick = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/alerts/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(id ? { id } : { all }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(j?.error?.message ?? `HTTP ${res.status}`);
      }
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "실패");
    } finally {
      setBusy(false);
    }
  };
  return (
    <span className="ad-alert-act">
      <button type="button" className="ad-textbtn" onClick={onClick} disabled={busy} aria-busy={busy} aria-label={name ? `${name} ${label}` : label}>
        {busy ? "처리 중…" : label}
      </button>
      <span role="alert" className="ad-error">{err ?? ""}</span>
    </span>
  );
}
