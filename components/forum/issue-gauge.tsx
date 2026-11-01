"use client";

// ============================================================================
// components/forum/issue-gauge — 상세 상단 "이 사안 온도" 눈금
//
// 12칸 눈금(수은은 여기에만) + "{사안} {온도}° {밴드}" 활자 + 온도계 링크.
// nudgeKey 가 바뀌면(공감을 누르면) 눈금이 한 칸(6px) 흔들렸다 돌아오고,
// pending 이면 "반영 예정(15분)" 을 병기한다 — 반영은 크론(15분) 몫이라 숫자는
// 건드리지 않는다. 색 의존 0: 숫자·밴드 활자가 항상 함께 있다.
// ============================================================================

import Link from "next/link";
import { useEffect, useState } from "react";
import type { IssueTemp } from "./issue-temp";

const TICKS = 12;

export function IssueGauge({
  issue,
  nudgeKey = 0,
  pending = false,
}: {
  issue: IssueTemp;
  /** 값이 바뀔 때마다 눈금이 한 칸 흔들린다 */
  nudgeKey?: number;
  /** "반영 예정(15분)" 병기 */
  pending?: boolean;
}) {
  const [nudge, setNudge] = useState(false);

  useEffect(() => {
    if (!nudgeKey) return undefined;
    setNudge(true);
    const t = setTimeout(() => setNudge(false), 200);
    return () => clearTimeout(t);
  }, [nudgeKey]);

  const on = Math.max(0, Math.min(TICKS, Math.round((issue.temperature / 100) * TICKS)));

  return (
    <div
      className={nudge ? "fo-gauge is-nudge" : "fo-gauge"}
      role="group"
      aria-label={`이 사안 온도 ${issue.temperature}도 ${issue.band}`}
    >
      <span className="fo-gauge-label">이 사안 온도</span>
      <span className="fo-gauge-ticks" aria-hidden>
        {Array.from({ length: TICKS }, (_, i) => (
          <i key={i} className={i < on ? "on" : undefined} />
        ))}
      </span>
      <span className="fo-gauge-val">
        <Link href="/temperature">{issue.label}</Link> {issue.temperature}° {issue.band}
      </span>
      {pending ? (
        <span className="fo-gauge-pending" role="status" aria-live="polite">
          반영 예정(15분)
        </span>
      ) : null}
    </div>
  );
}
