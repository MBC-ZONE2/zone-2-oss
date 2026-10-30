// ============================================================================
// GET/PATCH /api/admin/users — 관리자 계정 역할·소속(org) 관리
//
// 역할의 SSOT 는 auth.users.app_metadata.role, 소속의 SSOT 는 app_metadata.org.
// 소속은 이중 컨펌(회의 결정 [9])에서 "이 사람이 어느 사(社)를 대표해 확인하는가"
// 를 정한다. super_admin 은 소속 없이 양쪽을 확인할 수 있으므로 org 를 두지 않고,
// 기자 역할(operator_mbc/operator_oki)은 소속이 반드시 있어야 확인할 수 있다.
// ============================================================================

import { z } from "zod";
import type { User } from "@supabase/supabase-js";
import {
  errorResponse,
  extractExplicitOrg,
  extractNickname,
  extractOrg,
  extractProvider,
  extractRole,
  isAssignableAdminRole,
  okResponse,
  orgFromRole,
  requirePermission,
  type AdminOrg,
} from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";

const updateSchema = z.object({
  userId: z.string().uuid(),
  role: z
    .enum(["super_admin", "operator_mbc", "operator_oki"])
    .nullable(),
  /**
   * 소속. 생략하면 역할이 함축하는 기본 소속으로 채운다
   * (operator_mbc→mbc, operator_oki→okinews, 그 외 null).
   */
  org: z.enum(["okinews", "mbc"]).nullable().optional(),
});

function isAdminAccountCandidate(user: User): boolean {
  const requested = (user.user_metadata as { admin_access_requested?: unknown } | null)
    ?.admin_access_requested;
  return extractRole(user) !== null || requested === true;
}

function publicUser(user: User) {
  return {
    id: user.id,
    displayName: extractNickname(user),
    email: user.email ?? null,
    provider: extractProvider(user),
    role: extractRole(user),
    /** app_metadata.org 에 저장된 값 (미지정이면 null) */
    org: extractExplicitOrg(user),
    /** 실제 확인에 쓰이는 소속 — 미지정이면 역할에서 유추한 값 */
    effectiveOrg: extractOrg(user),
    createdAt: user.created_at,
    lastSignInAt: user.last_sign_in_at ?? null,
  };
}

/**
 * 역할에 맞는 소속을 확정한다.
 *   - 권한 없음(role=null) / super_admin → 소속 없음(null)
 *   - 기자 역할 → 요청값이 있으면 그대로, 없으면 역할의 기본 소속
 */
function resolveOrgForRole(
  role: "super_admin" | "operator_mbc" | "operator_oki" | null,
  requested: AdminOrg | null | undefined,
): AdminOrg | null {
  if (role === null || role === "super_admin") return null;
  return requested ?? orgFromRole(role);
}

export async function GET() {
  const guard = await requirePermission("users.manage");
  if (guard.response) return guard.response;

  const service = createServiceClient();
  const [{ data: usersData, error: usersError }, { data: logs, error: logsError }] =
    await Promise.all([
      service.auth.admin.listUsers({ page: 1, perPage: 200 }),
      service
        .from("admin_account_audit_logs")
        .select(
          // details 에는 소속(org) 변경 기록이 들어 있다(previous_org/new_org).
          "id, actor_id, subject_id, action, previous_role, new_role, details, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(30),
    ]);

  if (usersError) {
    console.error("admin users: Auth 사용자 조회 실패", usersError);
    return errorResponse(500, "USERS_READ_FAILED", "계정 목록을 불러오지 못했습니다.");
  }
  if (logsError) {
    console.error("admin users: 감사 로그 조회 실패", logsError);
  }

  return okResponse({
    users: usersData.users.filter(isAdminAccountCandidate).map(publicUser),
    auditLogs: logsError ? [] : (logs ?? []),
  });
}

export async function PATCH(request: Request) {
  const guard = await requirePermission("users.manage");
  if (guard.response) return guard.response;

  let parsed: z.infer<typeof updateSchema>;
  try {
    parsed = updateSchema.parse(await request.json());
  } catch {
    return errorResponse(400, "INVALID_REQUEST", "계정 또는 역할 값이 올바르지 않습니다.");
  }

  if (parsed.role !== null && !isAssignableAdminRole(parsed.role)) {
    return errorResponse(400, "INVALID_ROLE", "부여할 수 없는 역할입니다.");
  }
  if (parsed.userId === guard.user.id && parsed.role !== "super_admin") {
    return errorResponse(
      400,
      "SELF_LOCKOUT",
      "현재 로그인한 관리자 자신의 관리자 권한은 해제할 수 없습니다.",
    );
  }

  const service = createServiceClient();
  const { data: targetData, error: targetError } =
    await service.auth.admin.getUserById(parsed.userId);
  const target = targetData.user;
  if (targetError || !target) {
    return errorResponse(404, "USER_NOT_FOUND", "계정을 찾을 수 없습니다.");
  }

  const previousRole = extractRole(target);
  const previousOrg = extractExplicitOrg(target);
  const nextOrg = resolveOrgForRole(parsed.role, parsed.org);
  if (previousRole === parsed.role && previousOrg === nextOrg) {
    return okResponse({ user: publicUser(target), unchanged: true });
  }

  const previousMetadata = target.app_metadata ?? {};
  const nextMetadata = { ...previousMetadata, role: parsed.role, org: nextOrg };
  const { data: updatedData, error: updateError } =
    await service.auth.admin.updateUserById(parsed.userId, {
      app_metadata: nextMetadata,
    });
  if (updateError || !updatedData.user) {
    console.error("admin users: 역할 변경 실패", updateError);
    return errorResponse(500, "ROLE_UPDATE_FAILED", "역할을 변경하지 못했습니다.");
  }

  // 소속만 바뀐 경우도 role_change 로 남긴다(테이블 check 제약이 세 값만 허용).
  const action = parsed.role
    ? previousRole
      ? "role_change"
      : "role_assign"
    : "role_revoke";
  const { error: auditError } = await service.from("admin_account_audit_logs").insert({
    actor_id: guard.user.id,
    subject_id: parsed.userId,
    action,
    previous_role: previousRole,
    new_role: parsed.role,
    details: {
      subject_name: extractNickname(target),
      provider: extractProvider(target),
      // 소속 변경 이력 — 이중 컨펌 주체가 바뀐 기록 (previous/new_role 은 역할 전용 컬럼)
      previous_org: previousOrg,
      new_org: nextOrg,
    },
  });

  if (auditError) {
    console.error("admin users: 감사 로그 기록 실패, 역할 변경 롤백 시도", auditError);
    // app_metadata 는 얕은 병합이라 이전 값을 명시해야 확실히 되돌아간다.
    await service.auth.admin.updateUserById(parsed.userId, {
      app_metadata: { ...previousMetadata, role: previousRole, org: previousOrg },
    });
    return errorResponse(
      500,
      "AUDIT_WRITE_FAILED",
      "감사 로그를 기록하지 못해 역할 변경을 취소했습니다.",
    );
  }

  return okResponse({ user: publicUser(updatedData.user), unchanged: false });
}
