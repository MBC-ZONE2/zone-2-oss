// ============================================================================
// GET /api/admin/backups — 야간 백업 파일 목록(위치·크기·시각). 가드: system.config(관리자). 2026-10-27
// ============================================================================

import { errorResponse, okResponse, requirePermission } from "@/lib/auth";
import { getBackupSummary } from "@/lib/ops/backups";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requirePermission("system.config");
  if (guard.response) return guard.response;
  try {
    return okResponse(await getBackupSummary());
  } catch (e) {
    return errorResponse(500, "BACKUPS_FAILED", e instanceof Error ? e.message : "백업 목록을 읽지 못했습니다.");
  }
}
