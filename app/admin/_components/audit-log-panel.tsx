"use client";

// ============================================================================
// app/admin/_components/audit-log-panel — 감사 로그 타임라인 + CSV 내보내기 (「일점 지면」)
//
// 출처: REQ(F7) — 감사로그 뷰 (이슈 #34)
//
// moderation_logs 를 대상/액션/기간으로 필터링해 괘선 행으로 보여주고,
// 이중 컨펌의 한쪽 확인 단계(action='confirm')는 "기관 확인"으로 승인과 구분한다.
// 현재 목록을 CSV(UTF-8 BOM, 한글 엑셀 호환)로 내보낸다. 권한: logs.view.
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import { toast } from "@/components/ui/sonner";
import { apiFetch, fmtDateTime, ACTION_LABEL, TARGET_LABEL, type LogItem } from "./lib";

interface LogsResponse {
  items: LogItem[];
  nextCursor: string | null;
}

/**
 * 액션 라벨 — 공용 표(ACTION_LABEL)에 이중 컨펌 단계를 더한다.
 * confirm = 한쪽 기관만 확인한 단계(아직 미발행) — 승인과 구분해 보여준다(0019).
 */
const LOG_ACTION_LABEL: Record<string, string> = {
  ...ACTION_LABEL,
  confirm: "기관 확인",
};

/** 롤백은 action=reject + details.kind=rollback → 표시 라벨 보정 */
function displayAction(l: LogItem): string {
  if (l.details && l.details.kind === "rollback") return "롤백";
  if (l.details && l.details.kind === "dup_story") return "중복 정리";
  return LOG_ACTION_LABEL[l.action] ?? l.action;
}

/**
 * CSV 셀 이스케이프.
 * =,+,-,@ 로 시작하는 값은 스프레드시트가 수식으로 해석하므로 작은따옴표를
 * 접두해 수식 인젝션을 중화한다(교차리뷰 반영).
 */
function csvCell(v: string): string {
  const neutralized = /^[=+\-@]/.test(v) ? `'${v}` : v;
  return `"${neutralized.replace(/"/g, '""')}"`;
}

/** 로그 → CSV 문자열 (UTF-8 BOM, CRLF) */
function toCsv(logs: LogItem[]): string {
  const header = ["일시", "대상", "액션", "대상ID", "운영자", "사유", "상세"];
  const rows = logs.map((l) => [
    l.createdAt,
    TARGET_LABEL[l.target] ?? l.target,
    displayAction(l),
    l.targetId,
    l.operator ?? "",
    l.reason ?? "",
    l.details ? JSON.stringify(l.details) : "",
  ]);
  const lines = [header, ...rows].map((r) => r.map((c) => csvCell(String(c))).join(","));
  // ﻿: UTF-8 BOM — 한글 엑셀에서 인코딩 자동 인식.
  return "﻿" + lines.join("\r\n");
}

/** CSV blob 다운로드 (클라이언트 생성) */
function downloadCsv(logs: LogItem[]): void {
  const blob = new Blob([toCsv(logs)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const TARGET_OPTIONS = [
  ["all", "전체 대상"],
  ["crossview", "크로스뷰"],
  ["podcast", "팟캐스트"],
  ["forum", "공론장"],
  ["temperature", "온도계"],
];
const ACTION_OPTIONS = [
  ["all", "전체 액션"],
  ["approve", "승인"],
  ["edit_approve", "수정승인"],
  ["confirm", "기관 확인"],
  ["auto_publish", "마감 공개"],
  ["cleanup", "운영 정리"],
  ["reject", "반려/롤백"],
];

/** 로그 한 줄 — 상세(details) 펼침 */
function LogRow({ log }: { log: LogItem }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="ad-log">
      <div className="ad-log-head">
        <time dateTime={log.createdAt}>{fmtDateTime(log.createdAt)}</time>
        <span className="ad-tag">{TARGET_LABEL[log.target] ?? log.target}</span>
        <span className="ad-act">{displayAction(log)}</span>
        <span className="ad-mono" title={log.operator ?? undefined}>
          {log.operator ? `${log.operator.slice(0, 8)}…` : "시스템"}
        </span>
      </div>
      {log.reason && <p>사유: {log.reason}</p>}
      {log.details && (
        <div>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="ad-textbtn is-quiet"
            style={{ minHeight: 32, padding: "4px 0" }}
          >
            {open ? "상세 접기" : "상세 보기"}
          </button>
          {open && <pre>{JSON.stringify(log.details, null, 2)}</pre>}
        </div>
      )}
    </li>
  );
}

export function AuditLogPanel() {
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState("all");
  const [action, setAction] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ target, action });
    if (from) params.set("from", `${from}T00:00:00`);
    if (to) params.set("to", `${to}T23:59:59`);
    const res = await apiFetch<LogsResponse>(`/api/admin/logs?${params}`);
    if (res.error) {
      setError(res.error.message);
      setLogs([]);
    } else {
      setLogs(res.data.items);
    }
    setLoading(false);
  }, [target, action, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section>
      <div className="ad-section-head">
        <div>
          <h2>감사 로그</h2>
          <p>검수·수정승인·롤백 등 모든 처리 이력입니다.</p>
        </div>
        <div className="ad-r">
          {!loading && !error && <span>{logs.length}건</span>}
          <button
            type="button"
            className="ad-textbtn"
            disabled={logs.length === 0}
            onClick={() => {
              downloadCsv(logs);
              toast.success(`${logs.length}건을 CSV로 내보냈습니다.`);
            }}
          >
            CSV 내보내기
          </button>
        </div>
      </div>

      <div className="ad-filters">
        <select
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          aria-label="대상 필터"
          className="ad-select"
        >
          {TARGET_OPTIONS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <select
          value={action}
          onChange={(e) => setAction(e.target.value)}
          aria-label="액션 필터"
          className="ad-select"
        >
          {ACTION_OPTIONS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          aria-label="시작일"
          className="ad-field"
          style={{ flex: "0 1 180px" }}
        />
        <span className="ad-sep">~</span>
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          aria-label="종료일"
          className="ad-field"
          style={{ flex: "0 1 180px" }}
        />
      </div>

      {error && (
        <p role="alert" className="ad-error" style={{ marginTop: 16 }}>
          {error}
        </p>
      )}

      {loading ? (
        <ul className="ad-pending" aria-hidden>
          {[0, 1, 2, 3, 4].map((i) => (
            <li key={i} />
          ))}
        </ul>
      ) : logs.length === 0 ? (
        <div className="ad-empty">
          <strong>조건에 맞는 로그가 없습니다</strong>
        </div>
      ) : (
        <ul className="ad-rows" style={{ borderTop: 0 }}>
          {logs.map((log) => (
            <LogRow key={log.id} log={log} />
          ))}
        </ul>
      )}
    </section>
  );
}
