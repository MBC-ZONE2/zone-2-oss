// ============================================================================
// /admin/metrics — 검증지표 대시보드 (보호 페이지, 읽기 전용) — #181
//
// 결과보고서 5대 검증지표(docs/02)·검수 승인율·수집 실적·최근 30일 일별·열린 경고를 한 화면에.
// 숫자는 lib/metrics(buildMetricsReport) — scripts/report/report-stage1 과 같은 함수라 터미널과 화면이 같다.
// 가드: 미인증 → /admin/login, logs.view 권한(모든 역할 보유 — viewer 포함 읽기 전용).
// ============================================================================

import { redirect } from "next/navigation";
import { getAdminUser, getAuthUser, roleHasPermission } from "@/lib/auth";
import { buildMetricsReport, DEFAULT_PERIOD, isPeriodKey, type PeriodKey } from "@/lib/metrics";
import { createServiceClient } from "@/lib/supabase/server";
import { MetricsView } from "../_components/metrics-view";
import { SystemAlerts } from "../_components/system-alerts";

export default async function AdminMetricsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const user = await getAdminUser();
  if (!user) {
    const authUser = await getAuthUser();
    redirect(authUser ? "/admin/pending" : "/admin/login");
  }
  if (!roleHasPermission(user.role, "logs.view")) redirect("/admin");

  const sp = await searchParams;
  const period: PeriodKey = isPeriodKey(sp.period) ? sp.period : DEFAULT_PERIOD;

  let error: string | null = null;
  let report = null;
  try {
    report = await buildMetricsReport(createServiceClient(), period);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <main>
      <header className="ad-page-head">
        <h1>검증지표</h1>
        <p>
          결과보고서 5대 검증지표와 수집·생성 실적. 숫자는 전부 DB 실측이며, 측정할 수 없는 항목은 숫자를 만들지
          않고 사유를 적는다. 터미널 <code>pnpm report:stage1</code> 과 같은 함수로 센다.
        </p>
      </header>
      <SystemAlerts />
      {report ? (
        <MetricsView report={report} />
      ) : (
        <p role="alert" className="ad-error">
          지표를 불러오지 못했습니다 — {error}. DB 함수 <code>metrics_daily</code>(0022_metrics) 적용 여부를 확인해
          주세요.
        </p>
      )}
    </main>
  );
}
