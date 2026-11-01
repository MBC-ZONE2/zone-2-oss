"use client";

// ============================================================================
// app/admin/_components/admin-dashboard — 관리자 대시보드 상단 셸 (「일점 지면」)
//
// 출처: REQ(F7) — 검수 큐 / 콘텐츠 관리 / 감사 로그 (이슈 #34)
//
// 로그인 직후 "지금 처리할 일"을 **숫자 줄**로 먼저 읽힌다(44px 800, 0 이면 흐린 잉크,
// 경고는 빨강) — 카드 상자가 아니라 괘선 두 줄 사이의 활자다. 그 아래 세 영역을
// 텍스트 탭(검수 큐 N · 콘텐츠 관리 · 감사 로그)으로 가른다. 각 영역의 액션 가용성은
// 권한 플래그로 제어한다. 스타일: app/admin.css(.ad-stats/.ad-tabs)
// ============================================================================

import Link from "next/link";
import { useState } from "react";
import { QueueDashboard } from "./queue-dashboard";
import { ContentPanel } from "./content-panel";
import { AuditLogPanel } from "./audit-log-panel";
import type { AdminSummary } from "./summary";
import { BACKUP_STALE_HOURS, formatBytes, type BackupFile } from "@/lib/ops/backups-shared";

type Section = "queue" | "content" | "logs";

/** 처리 지표 한 칸 — 숫자 + 이름 + 한 줄 설명. 있으면 잉크, 없으면 흐린 잉크 */
function Stat({
  label,
  value,
  hint,
  tone,
  onClick,
  href,
}: {
  label: string;
  value: number;
  hint: string;
  tone: "action" | "danger" | "neutral";
  onClick?: () => void;
  href?: string;
}) {
  const on = value > 0;
  const inner = (
    <>
      <b>{value}</b>
      <span className="ad-stat-l">
        <strong>{label}</strong>
        <span>{hint}</span>
      </span>
    </>
  );
  const data = { "data-on": on ? "true" : "false", "data-tone": tone } as const;
  if (href) {
    return (
      <Link href={href} className="ad-stat" {...data}>
        {inner}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="ad-stat" {...data}>
        {inner}
      </button>
    );
  }
  return (
    <div className="ad-stat" {...data}>
      {inner}
    </div>
  );
}

export function AdminDashboard({
  canModerate,
  canRollback,
  canViewLogs,
  summary,
}: {
  canModerate: boolean;
  canRollback: boolean;
  canViewLogs: boolean;
  summary: AdminSummary;
}) {
  const [section, setSection] = useState<Section>("queue");

  const sections: { key: Section; label: string; badge?: number }[] = [
    { key: "queue", label: "검수 큐", badge: summary.queue.total },
    { key: "content", label: "콘텐츠 관리" },
    ...(canViewLogs ? [{ key: "logs" as const, label: "감사 로그" }] : []),
  ];

  const allClear =
    summary.queue.total === 0 &&
    summary.alerts === 0 &&
    (summary.pendingUsers ?? 0) === 0;

  return (
    <div>
      {/* 지금 처리할 일 — 숫자 줄 ------------------------------------------ */}
      <section aria-label="처리 요약">
        <div className="ad-stats-head">
          <h2>지금 처리할 일</h2>
          {allClear && <span className="ad-clear">모두 처리됨</span>}
        </div>
        <div className="ad-stats">
          <Stat
            label="검수 대기"
            value={summary.queue.total}
            hint="크로스뷰 · 팟캐스트 · 공론장 승인 대기"
            tone="action"
            onClick={() => setSection("queue")}
          />
          <Stat
            label="미해결 경고"
            value={summary.alerts}
            hint="수집·재랭킹 실패 등 시스템 경고"
            tone="danger"
          />
          {summary.pendingUsers !== null && (
            <Stat
              label="승인 대기 유저"
              value={summary.pendingUsers}
              hint="역할 미지정 · 계정·권한 관리에서 승인"
              tone="neutral"
              href="/admin/users"
            />
          )}
        </div>
      </section>

      {/* 방문자 — 푸터 공개 수치와 같은 값(2026-10-26 대표 지시). 자세한 일별 표는 /admin/metrics */}
      {summary.visits && (
        <section aria-label="방문자" className="ad-visits">
          <div className="ad-stats-head">
            <h2>방문자</h2>
            <span className="ad-clear">
              하루 한 번 익명 집계 · {summary.visits.since.replaceAll("-", ".")}부터 · 누적은 일별 순방문자 합
            </span>
          </div>
          <div className="ad-stats">
            <Stat
              label="오늘 방문"
              value={summary.visits.today}
              hint="오늘(KST) 순방문자 · 새로 고치면 갱신(서버 60초 캐시)"
              tone="neutral"
              href="/admin/metrics"
            />
            <Stat
              label="누적 방문"
              value={summary.visits.total}
              hint="시작일부터 오늘까지 일별 순방문자 합"
              tone="neutral"
              href="/admin/metrics"
            />
          </div>
        </section>
      )}

      {/* 백업 — 운영 머신의 야간 백업(scripts/ops/backup-db.sh, launchd 04:20). 관리자만(2026-10-27 대표 지시: 위치와 내려받기) */}
      {summary.backups && (() => {
        const b = summary.backups;
        const stale = b.dbAgeHours == null || b.dbAgeHours > BACKUP_STALE_HOURS;
        const row = (f: BackupFile | null, label: string, hint: string) => (
          <tr key={label}>
            <th scope="row">{label}</th>
            {f ? (
              <>
                <td>{f.mtime.replace("T", " ").slice(0, 16)} UTC</td>
                <td className="is-num">{formatBytes(f.size)}</td>
                <td>
                  <a href={`/api/admin/backups/download?kind=${f.kind}&name=${encodeURIComponent(f.name)}`} className="ad-textbtn is-quiet">
                    {f.name} 내려받기
                  </a>
                </td>
              </>
            ) : (
              <td colSpan={3} className="is-bad">없음 — {hint}</td>
            )}
          </tr>
        );
        return (
          <section aria-label="백업" className="ad-visits">
            <div className="ad-stats-head">
              <h2>백업</h2>
              <span className="ad-clear">
                매일 04:20 DB 덤프(14일 보존) · 일요일 사진·음성 저장소 묶음(4개 보존) · 운영 머신 <code>{b.dir}</code> · 합계 {formatBytes(b.totalBytes)}
              </span>
            </div>
            {stale && (
              <p role="status" className="ad-hint is-warn">
                {b.dbAgeHours == null ? "DB 덤프가 하나도 없습니다." : `마지막 DB 덤프가 ${b.dbAgeHours}시간 전입니다.`} 야간 백업 잡(kr.zone2.backup)이 돌았는지 확인해 주세요.
              </p>
            )}
            <table className="ad-table">
              <thead>
                <tr>
                  <th>종류</th>
                  <th>만든 시각</th>
                  <th className="is-num">크기</th>
                  <th>파일</th>
                </tr>
              </thead>
              <tbody>
                {row(b.latestDb, "DB 최신 덤프", "pg_dump 가 아직 돌지 않았습니다")}
                {row(b.latestStorage, "저장소 최신 묶음", "첫 일요일에 만들어집니다")}
              </tbody>
            </table>
            <p className="ad-clear">
              보관 중 DB {b.files.filter((f) => f.kind === "db").length}개 · 저장소 {b.files.filter((f) => f.kind === "storage").length}개. 복원 절차는 docs/deploy/mac-runbook.md §12.
            </p>
          </section>
        );
      })()}

      {/* 영역 탭 ------------------------------------------------------------ */}
      <nav aria-label="관리자 영역" className="ad-tabs">
        {sections.map((s) => {
          const current = section === s.key;
          return (
            <button
              key={s.key}
              type="button"
              aria-current={current ? "page" : undefined}
              onClick={() => setSection(s.key)}
            >
              {s.label}
              {typeof s.badge === "number" && s.badge > 0 && <b>{s.badge}</b>}
            </button>
          );
        })}
      </nav>

      {section === "queue" && (
        <QueueDashboard canModerate={canModerate} initialCounts={summary.queue} />
      )}
      {section === "content" && <ContentPanel canRollback={canRollback} />}
      {section === "logs" && canViewLogs && <AuditLogPanel />}
    </div>
  );
}
