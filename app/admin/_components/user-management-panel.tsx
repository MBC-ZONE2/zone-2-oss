"use client";

// ============================================================================
// app/admin/_components/user-management-panel — 계정 역할·소속 관리 (클라이언트, 「일점 지면」)
//
// 역할(role)과 함께 **소속(org)** 을 지정한다. 소속은 이중 컨펌(회의 결정 [9])
// 에서 "이 사람이 어느 사(社)를 대표해 확인하는가"를 정한다.
//   - 관리자(super_admin): 소속 없이 양쪽 확인 가능 → 소속 선택 없음
//   - 기자 역할: 소속 필수(기본값은 역할이 함축하는 사)
// 계정은 괘선 행(이름·칩 / 역할 / 확인 소속 / 저장). 승인 대기 계정은 왼쪽 주황 3px.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  CONFIRM_ORGS,
  ORG_LABEL,
  ROLE_LABEL,
  type AdminOrg,
  type AssignableAdminRole,
  type AdminRole,
} from "@/lib/auth/roles";

/** 역할 칩 — 관리자는 잉크 면, 나머지는 괘선 칩, 승인 대기는 주황 괘선 */
function RoleBadge({ role }: { role: AdminRole | null }) {
  if (!role) {
    return (
      <span className="ad-chip" data-tone="warn">
        승인 대기
      </span>
    );
  }
  return (
    <span
      className="ad-chip"
      data-done={role === "super_admin" ? "true" : undefined}
      data-tone={role === "viewer" ? "muted" : undefined}
    >
      {ROLE_LABEL[role]}
    </span>
  );
}

type ManagedUser = {
  id: string;
  displayName: string;
  email: string | null;
  provider: string | null;
  role: AdminRole | null;
  /** app_metadata.org 에 저장된 소속 (미지정이면 null) */
  org: AdminOrg | null;
  /** 실제 확인에 쓰이는 소속 — 미지정이면 역할에서 유추한 값 */
  effectiveOrg: AdminOrg | null;
  createdAt: string;
  lastSignInAt: string | null;
};

type AuditLog = {
  id: string;
  actor_id: string | null;
  subject_id: string | null;
  action: "role_assign" | "role_change" | "role_revoke";
  previous_role: AdminRole | null;
  new_role: AdminRole | null;
  /** { previous_org, new_org, ... } — 소속 변경 이력 */
  details: Record<string, unknown> | null;
  created_at: string;
};

type UsersPayload = { users: ManagedUser[]; auditLogs: AuditLog[] };
type ApiEnvelope<T> = { data: T | null; error: { message: string } | null };
type RoleSelection = AssignableAdminRole | "viewer" | "";
/** 소속 선택값 — 빈 문자열이면 미지정(관리자/권한 없음) */
type OrgSelection = AdminOrg | "";

/** 역할이 소속을 필요로 하는지 — 관리자(super_admin)는 양쪽을 대행하므로 불필요 */
function needsOrg(role: RoleSelection): boolean {
  return role === "operator_mbc" || role === "operator_oki";
}

/** 역할이 함축하는 기본 소속 (선택값 초기화용) */
function defaultOrg(role: RoleSelection): OrgSelection {
  if (role === "operator_mbc") return "mbc";
  if (role === "operator_oki") return "okinews";
  return "";
}

/** 소속 칩 — 확인 주체를 한눈에 */
function OrgBadge({ org }: { org: AdminOrg | null }) {
  if (!org) return null;
  return (
    <span className="ad-chip" data-tone="muted">
      {ORG_LABEL[org]}
    </span>
  );
}

/** 감사 로그에서 소속 변경 문구를 만든다 (없으면 null) */
function orgChangeLabel(details: Record<string, unknown> | null): string | null {
  if (!details) return null;
  const prev = details.previous_org;
  const next = details.new_org;
  if (prev === next) return null;
  const label = (v: unknown) => (v === "okinews" || v === "mbc" ? ORG_LABEL[v] : "소속 없음");
  return `소속 ${label(prev)} → ${label(next)}`;
}

const SELECTABLE_ROLES: { value: RoleSelection; label: string; disabled?: boolean }[] = [
  { value: "", label: "권한 없음 / 승인 대기" },
  { value: "super_admin", label: "관리자" },
  { value: "operator_mbc", label: ROLE_LABEL.operator_mbc },
  { value: "operator_oki", label: ROLE_LABEL.operator_oki },
  { value: "viewer", label: "읽기 전용(기존 계정)", disabled: true },
];

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function UserManagementPanel() {
  const [payload, setPayload] = useState<UsersPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [selections, setSelections] = useState<Record<string, RoleSelection>>({});
  const [orgSelections, setOrgSelections] = useState<Record<string, OrgSelection>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch("/api/admin/users", { cache: "no-store" });
    const body = (await response.json()) as ApiEnvelope<UsersPayload>;
    if (!response.ok || !body.data) {
      toast.error(body.error?.message ?? "계정 목록을 불러오지 못했습니다.");
      setLoading(false);
      return;
    }
    setPayload(body.data);
    setSelections(Object.fromEntries(body.data.users.map((user) => [user.id, user.role ?? ""])));
    setOrgSelections(
      Object.fromEntries(body.data.users.map((user) => [user.id, user.effectiveOrg ?? ""])),
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const names = useMemo(
    () => new Map(payload?.users.map((user) => [user.id, user.displayName]) ?? []),
    [payload],
  );

  async function saveRole(user: ManagedUser) {
    const selected = selections[user.id] ?? "";
    // 소속은 기자 역할에서만 의미가 있다 — 그 외에는 null 로 보낸다.
    const org = needsOrg(selected) ? (orgSelections[user.id] ?? defaultOrg(selected)) : "";
    setSavingId(user.id);
    const response = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        userId: user.id,
        role: selected || null,
        org: org || null,
      }),
    });
    const body = (await response.json()) as ApiEnvelope<unknown>;
    if (!response.ok) {
      toast.error(body.error?.message ?? "역할을 변경하지 못했습니다.");
      setSavingId(null);
      return;
    }
    toast.success("계정 권한을 변경했습니다.");
    await load();
    setSavingId(null);
  }

  if (loading) {
    return (
      <ul className="ad-pending" aria-hidden>
        {[0, 1, 2].map((i) => (
          <li key={i} style={{ height: 88 }} />
        ))}
      </ul>
    );
  }
  if (!payload) {
    return (
      <p className="ad-error" role="alert">
        계정 목록을 불러오지 못했습니다.
      </p>
    );
  }

  const pendingCount = payload.users.filter((u) => !u.role).length;

  return (
    <div>
      <section aria-labelledby="accounts-heading">
        <div className="ad-section-head" style={{ paddingTop: 8 }}>
          <div>
            <h2 id="accounts-heading">계정</h2>
            <p>카카오로 처음 로그인한 사용자는 권한 없음 상태로 표시됩니다.</p>
          </div>
          <div className="ad-r">
            {pendingCount > 0 && (
              <span className="ad-chip" data-tone="warn">
                승인 대기 {pendingCount}
              </span>
            )}
            <span>{payload.users.length}명</span>
          </div>
        </div>
        <ul className="ad-users">
          {payload.users.map((user) => {
            const current = user.role ?? "";
            const selected = selections[user.id] ?? current;
            const currentOrg = user.effectiveOrg ?? "";
            const selectedOrg = needsOrg(selected)
              ? (orgSelections[user.id] ?? defaultOrg(selected))
              : "";
            const unchanged = selected === current && selectedOrg === currentOrg;
            return (
              <li key={user.id} className="ad-user" data-pending={user.role ? undefined : "true"}>
                <div style={{ minWidth: 0 }}>
                  <div className="ad-name">
                    <strong>{user.displayName}</strong>
                    <RoleBadge role={user.role} />
                    <OrgBadge org={user.effectiveOrg} />
                  </div>
                  <p className="ad-meta">
                    {user.email ?? "이메일 미제공"} ·{" "}
                    {user.provider === "kakao" ? "카카오" : (user.provider ?? "공급자 미상")} · 최근 로그인{" "}
                    {formatDate(user.lastSignInAt)}
                  </p>
                </div>
                <label>
                  역할
                  <select
                    value={selected}
                    onChange={(event) => {
                      const next = event.target.value as RoleSelection;
                      setSelections((prev) => ({ ...prev, [user.id]: next }));
                      // 역할을 바꾸면 소속 기본값도 함께 맞춘다.
                      setOrgSelections((prev) => ({ ...prev, [user.id]: defaultOrg(next) }));
                    }}
                    className="ad-select"
                  >
                    {SELECTABLE_ROLES.map((option) => (
                      <option key={option.value || "none"} value={option.value} disabled={option.disabled}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  확인 소속
                  <select
                    value={selectedOrg}
                    disabled={!needsOrg(selected)}
                    title={
                      needsOrg(selected)
                        ? "이중 컨펌에서 이 계정이 대표하는 사(社)"
                        : "관리자는 소속 없이 양쪽을 확인할 수 있습니다."
                    }
                    onChange={(event) =>
                      setOrgSelections((prev) => ({
                        ...prev,
                        [user.id]: event.target.value as OrgSelection,
                      }))
                    }
                    className="ad-select"
                  >
                    {!needsOrg(selected) && <option value="">해당 없음</option>}
                    {CONFIRM_ORGS.map((org) => (
                      <option key={org} value={org}>
                        {ORG_LABEL[org]}
                      </option>
                    ))}
                  </select>
                </label>
                <Button
                  type="button"
                  size="sm"
                  disabled={unchanged || savingId === user.id}
                  onClick={() => void saveRole(user)}
                >
                  {savingId === user.id ? "저장 중…" : "권한 저장"}
                </Button>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="role-audit-heading">
        <div className="ad-section-head">
          <div>
            <h2 id="role-audit-heading">권한 변경 기록</h2>
          </div>
        </div>
        <ul className="ad-rows">
          {payload.auditLogs.length === 0 ? (
            <li className="ad-row" style={{ color: "var(--ad-sub)" }}>
              아직 변경 기록이 없습니다.
            </li>
          ) : (
            payload.auditLogs.map((log) => (
              <li key={log.id} className="ad-row">
                <time dateTime={log.created_at}>{formatDate(log.created_at)}</time>
                <span className="ad-row-t" style={{ whiteSpace: "normal" }}>
                  <strong>{names.get(log.subject_id ?? "") ?? "삭제된 계정"}</strong>{" "}
                  {log.previous_role ? ROLE_LABEL[log.previous_role] : "권한 없음"} →{" "}
                  {log.new_role ? ROLE_LABEL[log.new_role] : "권한 없음"}
                  {orgChangeLabel(log.details) && (
                    <span style={{ color: "var(--ad-sub)" }}> · {orgChangeLabel(log.details)}</span>
                  )}
                </span>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}
