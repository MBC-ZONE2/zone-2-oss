// ============================================================================
// GET /api/visit/stats — 오늘·누적 방문자 수 (공개, 2026-10-26 대표 지시)
//
// 응답 { today, total, since, todayDate } — lib/visits/counters(60초 서버 캐시) 그대로.
// 푸터의 components/visit-counter 가 부른다. 개인 단위 값은 없다(숫자 넷뿐).
// 집계를 못 가져오면 503 — 클라이언트는 줄을 그리지 않는다.
// ============================================================================

import { NextResponse } from "next/server";
import { VISIT_COUNTERS_TTL_SEC, getVisitCounters } from "@/lib/visits/counters";

export const dynamic = "force-dynamic";

export async function GET() {
  const counters = await getVisitCounters();
  if (!counters) {
    return NextResponse.json({ error: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json(counters, {
    headers: {
      "Cache-Control": `public, max-age=${VISIT_COUNTERS_TTL_SEC}, s-maxage=${VISIT_COUNTERS_TTL_SEC}, stale-while-revalidate=300`,
    },
  });
}
