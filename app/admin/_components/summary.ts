// ============================================================================
// app/admin/_components/summary — 운영 대시보드 "해야 할 일" 요약 카운트 (서버)
//
// 로그인 직후 "지금 무엇을 처리해야 하는지"를 한눈에 보여주기 위한 스냅샷 집계.
//   - 검수 대기: crossview/podcast/forum 각 대기 건수 (QUEUE_CONFIG 재사용)
//   - 미해결 경고: system_alerts.resolved=false 건수
//   - 승인 대기 유저: 역할 미지정 상태의 관리자 후보 계정 수 (users.manage 보유 시)
//   - 오늘·누적 방문: visit_counters()(0029) — 푸터 공개 수치와 동일(2026-10-26)
//   - 야간 백업: 백업 폴더의 최신 DB 덤프·스토리지 묶음(system.config 보유 시, lib/ops/backups — 2026-10-27)
//
// 순수 조회(head:count)만 수행하며 권한/기능 로직은 건드리지 않는다. 테이블
// 미적용·조회 오류는 조용히 0 으로 흡수해 대시보드를 무손상 유지한다.
// (SystemAlerts 와 동일한 방어적 패턴)
// ============================================================================

import { createServiceClient } from "@/lib/supabase/server";
import { getVisitCounters, type VisitCounters } from "@/lib/visits/counters";
import { getBackupSummary } from "@/lib/ops/backups";
import type { BackupSummary } from "@/lib/ops/backups-shared";
import { extractRole } from "@/lib/auth";
import {
  QUEUE_CONFIG,
  type QueueTarget,
} from "@/app/api/admin/_lib/moderation";

export interface QueueCounts {
  crossview: number;
  podcast: number;
  forum: number;
  total: number;
}

export interface AdminSummary {
  queue: QueueCounts;
  /** 미해결 시스템 경고 수 */
  alerts: number;
  /** 승인 대기(역할 미지정) 계정 수. 권한이 없으면 null(카드 미표시). */
  pendingUsers: number | null;
  /** 오늘·누적 방문(푸터와 같은 값, lib/visits/counters). 못 가져오면 null */
  visits: VisitCounters | null;
  /** 야간 백업 현황(관리자만). 권한이 없거나 못 읽으면 null */
  backups: BackupSummary | null;
}

const EMPTY_QUEUE: QueueCounts = {
  crossview: 0,
  podcast: 0,
  forum: 0,
  total: 0,
};

/** 단일 대상의 검수 대기 건수 (head:count — 행 본문 미전송) */
async function countTarget(
  sb: ReturnType<typeof createServiceClient>,
  target: QueueTarget,
): Promise<number> {
  try {
    const c = QUEUE_CONFIG[target];
    const { count } = await sb
      .from(c.table)
      .select("id", { count: "exact", head: true })
      .eq(c.filterColumn, c.filterValue);
    return count ?? 0;
  } catch {
    return 0;
  }
}

/** 미해결 시스템 경고 수 */
async function countAlerts(
  sb: ReturnType<typeof createServiceClient>,
): Promise<number> {
  try {
    const { count } = await sb
      .from("system_alerts")
      .select("id", { count: "exact", head: true })
      .eq("resolved", false);
    return count ?? 0;
  } catch {
    return 0;
  }
}

/** 승인 대기(역할 미지정) 계정 수 — users 라우트의 후보 판정과 동일 기준.
 * listUsers 지연이 대시보드 렌더를 막지 않도록 4초 타임아웃으로 0 폴백. */
async function countPendingUsers(
  sb: ReturnType<typeof createServiceClient>,
): Promise<number> {
  const query = (async () => {
    const { data } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
    return data.users.filter((u) => {
      const requested = (u.user_metadata as { admin_access_requested?: unknown } | null)
        ?.admin_access_requested;
      return extractRole(u) === null && requested === true;
    }).length;
  })();
  const timeout = new Promise<number>((resolve) =>
    setTimeout(() => resolve(0), 4000),
  );
  try {
    return await Promise.race([query, timeout]);
  } catch {
    return 0;
  }
}

/**
 * 대시보드 요약 카운트를 집계한다.
 * @param canManageUsers users.manage 보유 여부 — 승인 대기 카드 표시/집계 게이트
 * @param canViewBackups system.config 보유 여부 — 백업 현황 표시 게이트(덤프엔 전 데이터가 들어 있다)
 */
export async function getAdminSummary(
  canManageUsers: boolean,
  canViewBackups = false,
): Promise<AdminSummary> {
  const backups = canViewBackups ? getBackupSummary().catch(() => null) : Promise.resolve<BackupSummary | null>(null);
  let sb: ReturnType<typeof createServiceClient>;
  try {
    sb = createServiceClient();
  } catch {
    return { queue: EMPTY_QUEUE, alerts: 0, pendingUsers: canManageUsers ? 0 : null, visits: null, backups: await backups };
  }

  const [crossview, podcast, forum, alerts, pendingUsers, visits] = await Promise.all([
    countTarget(sb, "crossview"),
    countTarget(sb, "podcast"),
    countTarget(sb, "forum"),
    countAlerts(sb),
    canManageUsers ? countPendingUsers(sb) : Promise.resolve<number | null>(null),
    getVisitCounters(),
  ]);

  return {
    queue: { crossview, podcast, forum, total: crossview + podcast + forum },
    alerts,
    pendingUsers,
    visits,
    backups: await backups,
  };
}
