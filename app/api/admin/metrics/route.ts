// ============================================================================
// GET /api/admin/metrics?period=oct|report2w|reportcum|pilot|30d&format=json|csv — 검증지표 보고서 (#181, 결과보고 프리셋 #190, 기본 10월)
//
// /admin/metrics 와 같은 lib/metrics(buildMetricsReport). format=csv 는 결과보고서로 옮기기 위한
// 내려받기(UTF-8 BOM). 가드: logs.view(모든 관리자 역할).
// ============================================================================

import type { NextRequest } from "next/server";
import { errorResponse, okResponse, requirePermission } from "@/lib/auth";
import { buildMetricsReport, DEFAULT_PERIOD, isPeriodKey, reportToCsv } from "@/lib/metrics";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const guard = await requirePermission("logs.view");
  if (guard.response) return guard.response;

  const { searchParams } = new URL(request.url);
  const periodParam = searchParams.get("period") ?? DEFAULT_PERIOD;
  if (!isPeriodKey(periodParam)) return errorResponse(400, "INVALID_PERIOD", "period 는 oct|report2w|reportcum|pilot|30d 중 하나입니다.");
  const format = searchParams.get("format") === "csv" ? "csv" : "json";

  try {
    const report = await buildMetricsReport(createServiceClient(), periodParam);
    if (format === "csv") {
      return new Response(reportToCsv(report), {
        status: 200,
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="zone2-metrics-${periodParam}-${report.period.until}.csv"`,
          "cache-control": "no-store",
        },
      });
    }
    return okResponse(report);
  } catch (e) {
    return errorResponse(500, "METRICS_FAILED", e instanceof Error ? e.message : "지표 집계 실패");
  }
}
