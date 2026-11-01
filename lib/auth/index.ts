// ============================================================================
// lib/auth — 관리자 인증 + 역할 가드 (그룹 E)
//
// 출처: docs/06-API명세.md §2, deliverables/07-관리자-권한표.md
//   - roles:   역할 정의 + 권한 매트릭스 (SSOT)
//   - session: Supabase Auth 세션 → 인증 사용자 + 역할
//   - guard:   Route Handler 가드 (requireAuth / requirePermission)
//
// middleware.ts 는 공유 파일이라 수정하지 않는다. 이 헬퍼들을 사용한다.
// ============================================================================

export {
  type AdminOrg,
  type AdminRole,
  type AssignableAdminRole,
  type DualConfirmTarget,
  type Permission,
  ASSIGNABLE_ADMIN_ROLES,
  CONFIRM_ORGS,
  KNOWN_ROLES,
  ORG_LABEL,
  ROLE_LABEL,
  isAdminOrg,
  isAdminRole,
  isAssignableAdminRole,
  isDualConfirmTarget,
  orgFromRole,
  roleHasPermission,
  permissionsForRole,
  MODERATE_PERMISSION,
} from "./roles";

export {
  type AdminUser,
  extractExplicitOrg,
  extractNickname,
  extractOrg,
  extractProvider,
  extractRole,
  getAuthUser,
  getAdminUser,
} from "./session";

export {
  type GuardResult,
  errorResponse,
  okResponse,
  requireAuth,
  requirePermission,
} from "./guard";
