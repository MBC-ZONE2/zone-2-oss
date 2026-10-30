// ============================================================================
// lib/visits/counters — 오늘·누적 방문자 수 (서버 전용, 2026-10-26 대표 지시)
//
// DB 함수 visit_counters()(0029) 를 60초 캐시로 호출한다. 푸터(components/visit-counter →
// GET /api/visit/stats)와 관리자 대시보드(app/admin/_components/summary)가 같은 값을 쓴다.
//   오늘  = 오늘(KST) 순방문자(site_visits distinct visitor_hash)
//   누적  = 지난 날들의 일별 순방문자 합(site_visits_daily, 영구) + 오늘
// 실패하면 null — 화면은 줄을 그리지 않는다(숫자가 틀리게 보이는 것보다 낫다).
// 클라이언트 컴포넌트가 import 하는 lib/visits/index 와 분리한다(service 키가 번들에 섞이지 않게).
// ============================================================================

import { unstable_cache } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";

export interface VisitCounters {
  /** 오늘(KST) 순방문자 */
  today: number;
  /** 누적 방문 = 일별 순방문자 합(시작일부터 오늘까지) */
  total: number;
  /** 집계 시작일 YYYY-MM-DD */
  since: string;
  /** 오늘 날짜(KST) YYYY-MM-DD — 자정 경계 표시용 */
  todayDate: string;
}

export const VISIT_COUNTERS_TTL_SEC = 60;

async function loadVisitCounters(): Promise<VisitCounters | null> {
  try {
    const sb = createServiceClient();
    const { data, error } = await sb.rpc("visit_counters");
    if (error) return null;
    const row = ((data ?? []) as { today: number; total: number; since: string; today_date: string }[])[0];
    if (!row) return null;
    return {
      today: row.today ?? 0,
      total: row.total ?? 0,
      since: String(row.since),
      todayDate: String(row.today_date),
    };
  } catch {
    return null;
  }
}

/** 60초 캐시 — 페이지뷰마다 DB 를 치지 않는다 */
export const getVisitCounters = unstable_cache(loadVisitCounters, ["visit-counters"], {
  revalidate: VISIT_COUNTERS_TTL_SEC,
});
