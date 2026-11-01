// ============================================================================
// POST /api/admin/alerts/resolve — 시스템 경고 수동 확인(해소) (#189, 0028)
//
//   { id: uuid }            경고 하나를 확인
//   { all: "info" }         미해결 알림성(info) 경고 전부 확인
// 권한: alerts.resolve(super_admin·양사 운영자. 읽기 전용 viewer 는 제외 — codex 리뷰).
// system_alerts.resolved_by/at/note 에 누가·언제·어떻게(manual | manual-all-info) 남긴다.
// ============================================================================
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { requirePermission, okResponse, errorResponse } from "@/lib/auth";
import { resolveAlertById } from "@/lib/alerts";

export const runtime = "nodejs";

// strict — `{id:…, all:"info"}` 처럼 두 명령이 섞이면 거부(codex 리뷰)
const bodySchema = z.union([
  z.object({ id: z.string().uuid({ message: "id 는 UUID 여야 합니다." }) }).strict(),
  z.object({ all: z.literal("info") }).strict(),
]);

export async function POST(req: Request) {
  const guard = await requirePermission("alerts.resolve");
  if (guard.response) return guard.response;

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return errorResponse(400, "BAD_REQUEST", "id(UUID) 또는 all:'info' 가 필요합니다.");
  }

  const supabase = createServiceClient();
  try {
    if ("id" in body) {
      const changed = await resolveAlertById(supabase, body.id, guard.user.id, "manual");
      return okResponse({ resolved: changed ? 1 : 0 });
    }
    const { data, error } = await supabase
      .from("system_alerts")
      .update({ resolved: true, resolved_at: new Date().toISOString(), resolved_by: guard.user.id, resolved_note: "manual-all-info" })
      .eq("resolved", false)
      .eq("severity", "info")
      .select("id");
    if (error) throw new Error(error.message);
    return okResponse({ resolved: (data ?? []).length });
  } catch (e) {
    return errorResponse(500, "INTERNAL", e instanceof Error ? e.message : "경고 해소에 실패했습니다.");
  }
}
