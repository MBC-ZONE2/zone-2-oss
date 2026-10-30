// ============================================================================
// app/admin/_components/system-alerts — 운영 경고 (관리자 대시보드 상단, 「일점 지면」)
//
// system_alerts 의 미해결 경고를 노출한다(예: 구독 CLI 재랭킹 실패로 매칭 중단).
// service_role 로 직접 조회한다. 테이블 미적용/오류 시 조용히 미표시(대시보드 무손상).
// 빨강 1px 테두리 + 빨강 머리띠 — 데스크에서 색을 쓰는 몇 안 되는 자리(오류 신호).
// <details> 로 접힌 채 시작 — 머리띠(건수)만 보이고 펼치면 목록(대표 지시 2026-10-25).
// 각 줄 "확인"·알림(info) "모두 확인" 은 POST /api/admin/alerts/resolve(0028, #189) — 자동 해소 코드가 없는 경고를 사람이 걷는다.
// ============================================================================

import { createServiceClient } from "@/lib/supabase/server";
import { getAdminUser, roleHasPermission } from "@/lib/auth";
import { AlertResolveButton } from "./alert-resolve";

interface AlertRow {
  id: string;
  kind: string;
  severity: string;
  message: string;
  created_at: string;
}

export async function SystemAlerts() {
  let alerts: AlertRow[] = [];
  let infoCount = 0; // 테이블 전체의 미해결 info 건수 — "모두 확인"이 거는 범위와 같게(codex 리뷰)
  let canResolve = false;
  try {
    const sb = createServiceClient();
    const [list, info, user] = await Promise.all([
      sb
        .from("system_alerts")
        .select("id, kind, severity, message, created_at")
        .eq("resolved", false)
        .order("created_at", { ascending: false })
        .limit(10),
      sb.from("system_alerts").select("id", { count: "exact", head: true }).eq("resolved", false).eq("severity", "info"),
      getAdminUser(),
    ]);
    alerts = (list.data as AlertRow[] | null) ?? [];
    infoCount = info.count ?? 0;
    canResolve = !!user && roleHasPermission(user.role, "alerts.resolve");
  } catch {
    // 마이그레이션 미적용 등 — 조용히 미표시.
    return null;
  }

  if (alerts.length === 0) return null;

  // 접힌 채로 시작(대표 지시 2026-10-25): 머리띠에 건수만 보이고, 펼쳐야 목록이 나온다 — 큐보다 위에서 자리를 덜 차지하게
  return (
    <details className="ad-alerts" aria-label="시스템 경고">
      <summary>
        <h2>시스템 경고 {alerts.length}건 · 확인이 필요합니다</h2>
      </summary>
      {infoCount > 0 && (
        <p className="ad-alerts-bulk">
          알림(info) {infoCount}건은 기록용입니다 — 7일 지나면 자동으로 걷힙니다.
          {canResolve && <AlertResolveButton all="info" label={`알림 ${infoCount}건 모두 확인`} />}
        </p>
      )}
      <ul>
        {alerts.map((a) => (
          <li key={a.id}>
            <p className="ad-eyebrow">
              <span className="ad-tag">{a.kind}</span>
              {a.severity && a.severity !== "info" && <span className="ad-tag">{a.severity}</span>}
              <time dateTime={a.created_at}>{a.created_at.replace("T", " ").slice(0, 16)}</time>
              {canResolve && <AlertResolveButton id={a.id} label="확인" name={`${a.kind} 경고`} />}
            </p>
            <p>{a.message}</p>
          </li>
        ))}
      </ul>
    </details>
  );
}
