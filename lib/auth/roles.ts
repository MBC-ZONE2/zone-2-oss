// ============================================================================
// lib/auth/roles — 역할 정의 + 권한 매트릭스
//
// 출처: deliverables/07-관리자-권한표.md §1~2
// 역할은 Supabase Auth 의 app_metadata.role 에 저장된다.
// 권한 검사는 이 매트릭스를 단일 출처(SSOT)로 사용한다.
// ============================================================================

import { region } from "@/config/region";

/** 관리자 역할 (deliverables/07 §1) */
export type AdminRole =
  | "super_admin" // 최고관리자 (컨소시엄 PM) — 전체 권한
  | "operator_mbc" // MBC충북 운영자 — 광역 콘텐츠 검수
  | "operator_oki" // 옥천신문 운영자 — 기초·여론광장 검수
  | "viewer"; // 뷰어 — 읽기 전용

/** 알려진 역할 집합 (런타임 검증용) */
export const KNOWN_ROLES: readonly AdminRole[] = [
  "super_admin",
  "operator_mbc",
  "operator_oki",
  "viewer",
];

/** 관리자 화면에서 새로 부여할 수 있는 역할. viewer 는 레거시 호환만 유지한다. */
export const ASSIGNABLE_ADMIN_ROLES = [
  "super_admin",
  "operator_mbc",
  "operator_oki",
] as const satisfies readonly AdminRole[];

export type AssignableAdminRole = (typeof ASSIGNABLE_ADMIN_ROLES)[number];

/** 역할 코드 → 사용자 표시명 */
export const ROLE_LABEL: Record<AdminRole, string> = {
  super_admin: "관리자",
  operator_mbc: `${region.outlets.macro.name} 기자`,
  operator_oki: `${region.outlets.micro.name} 기자`,
  viewer: "읽기 전용",
};

/**
 * 권한(능력) 키 — deliverables/07 §2 권한 매트릭스의 행에 대응.
 * API/페이지 가드는 역할이 아니라 이 권한 키를 기준으로 검사한다.
 */
export type Permission =
  | "dashboard.view" // 대시보드 조회
  | "crossview.moderate" // 크로스뷰 승인/반려
  | "podcast.moderate" // 팟캐스트 승인/반려
  | "forum.moderate" // 공론장 게시물 모더레이션
  | "temperature.editLabel" // 온도계 이슈 라벨 수정
  | "match.addRule" // 수동 매칭 룰 추가
  | "bannedWords.manage" // 금칙어 사전 관리
  | "ingest.config" // 데이터 수집 설정
  | "schedule.edit" // 발행 스케줄 변경
  | "users.manage" // 사용자/권한 관리
  | "logs.view" // 통계·로그 조회
  | "alerts.resolve" // 시스템 경고 수동 확인(해소) — 읽기 전용 viewer 제외 (#189, 2026-10-25)
  | "content.rollback" // 발행됨 → 검수 되돌리기 (F7). 2026-10-19 대표 지시: 옥천신문·MBC충북 어느 한쪽이든 단독으로
  | "system.config"; // 시스템 설정

/**
 * 역할별 권한 매트릭스 (deliverables/07 §2).
 * ✅ = 허용. 표에 ✅ 인 권한만 나열한다(나머지는 거부).
 */
const ROLE_PERMISSIONS: Record<AdminRole, readonly Permission[]> = {
  super_admin: [
    "dashboard.view",
    "crossview.moderate",
    "podcast.moderate",
    "forum.moderate",
    "temperature.editLabel",
    "match.addRule",
    "bannedWords.manage",
    "ingest.config",
    "schedule.edit",
    "users.manage",
    "logs.view",
    "content.rollback",
    "alerts.resolve",
    "system.config",
  ],
  operator_mbc: [
    "dashboard.view",
    "crossview.moderate",
    "podcast.moderate",
    "forum.moderate",
    "temperature.editLabel",
    "match.addRule",
    "bannedWords.manage",
    "logs.view",
    "content.rollback", // 승인·발행된 콘텐츠 되돌리기 — 한쪽 단독(이중 컨펌 불필요, 2026-10-19)
    "alerts.resolve",
  ],
  operator_oki: [
    "dashboard.view",
    "crossview.moderate",
    "podcast.moderate", // 공동 검수
    "forum.moderate",
    "temperature.editLabel",
    "match.addRule",
    "bannedWords.manage",
    "logs.view",
    "content.rollback", // 승인·발행된 콘텐츠 되돌리기 — 한쪽 단독(이중 컨펌 불필요, 2026-10-19)
    "alerts.resolve",
  ],
  viewer: [
    // 읽기 전용 — 조회만 가능
    "dashboard.view",
    "logs.view",
  ],
};

/** 임의 문자열이 유효한 AdminRole 인지 검사 */
export function isAdminRole(value: unknown): value is AdminRole {
  return (
    typeof value === "string" && KNOWN_ROLES.includes(value as AdminRole)
  );
}

/** 해당 역할이 특정 권한을 가지는지 검사 */
export function roleHasPermission(
  role: AdminRole,
  permission: Permission,
): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

/** 계정 설정 화면에 표시할 현재 역할의 권한 목록 */
export function permissionsForRole(role: AdminRole): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}

export function isAssignableAdminRole(
  value: unknown,
): value is AssignableAdminRole {
  return (
    typeof value === "string" &&
    ASSIGNABLE_ADMIN_ROLES.includes(value as AssignableAdminRole)
  );
}

/**
 * 검수(moderate) 대상별 필요한 권한 매핑.
 * /api/admin/moderate 의 target → 권한 변환에 사용한다.
 */
export const MODERATE_PERMISSION: Record<
  "crossview" | "podcast" | "forum" | "temperature",
  Permission
> = {
  crossview: "crossview.moderate",
  podcast: "podcast.moderate",
  forum: "forum.moderate",
  temperature: "temperature.editLabel",
};

// ---------------------------------------------------------------------------
// 소속(org) + 이중 컨펌 — 회의 결정 [9]
//   콘텐츠는 옥천신문·MBC충북의 확인이 REQUIRED_CONFIRMATIONS 개 모이면 발행된다 — 2026-10-29 부터 1(어느 한쪽이 확인하면 즉시 공개).
//   소속은 auth.users.app_metadata.org 에 저장한다(역할과 별개 필드).
// ---------------------------------------------------------------------------

/** 확인 주체가 되는 언론사 소속 */
export type AdminOrg = "okinews" | "mbc";

/** 확인이 필요한 두 소속 (순서 = UI 표기 순서) */
export const CONFIRM_ORGS = ["okinews", "mbc"] as const satisfies readonly AdminOrg[];

/**
 * 공개에 필요한 확인 수(대표 결정 2026-10-29 "양사 중 한 곳이 컨펌하면 바로 노출, 3시간 기다리는 것 없애라").
 *   1 = 어느 한쪽이 확인하면 그 자리에서 공개(approve/edit_approve 로 기록·승인율 포함). 한쪽만 확인된 채 기다리는 상태가 없으므로
 *       3시간 자동 공개 스윕(lib/moderation/confirm-timeout)은 돌지 않는다.
 *   2 = 종전 양측 확인 필수(회의 결정 [9]) + CONFIRM_TIMEOUT_HOURS 절충.
 * 확인 칩("옥천신문 ✓ / MBC충북 –")·확인 기록(confirmations)·되돌리기는 값과 무관하게 그대로다.
 * 운영 mbcok.com 은 1. **공개 배포판은 2(양측 확인)로 내보낸다** — scripts/export-oss.sh 가 이 줄을 치환한다(대표 2026-10-29 "오픈소스에 올릴 것은 양사 컨펌").
 */
export const REQUIRED_CONFIRMATIONS: 1 | 2 = 2; // 공개 배포판: 옥천신문·MBC충북 양측 확인이 끝나야 공개

/** 소속 코드 → 표시명 */
export const ORG_LABEL: Record<AdminOrg, string> = {
  okinews: region.outlets.micro.name,
  mbc: region.outlets.macro.name,
};

/** 임의 값이 유효한 AdminOrg 인지 검사 */
export function isAdminOrg(value: unknown): value is AdminOrg {
  return value === "okinews" || value === "mbc";
}

/**
 * 역할이 함축하는 소속.
 * app_metadata.org 가 아직 없는 기존 계정(마이그레이션 전 데이터)의 폴백으로
 * 쓴다 — operator_mbc/operator_oki 는 역할 자체가 소속을 의미하므로,
 * 계정 관리에서 org 를 채우기 전에도 검수가 멈추지 않는다.
 * super_admin/viewer 는 null(super_admin 은 확인 시 소속을 직접 고른다).
 */
export function orgFromRole(role: AdminRole): AdminOrg | null {
  if (role === "operator_mbc") return "mbc";
  if (role === "operator_oki") return "okinews";
  return null;
}

/** 이중 컨펌 대상 — 공론장(forum)·온도계는 대상이 아니다(단일 모더레이션). */
export type DualConfirmTarget = "crossview" | "podcast";

/** 대상이 이중 컨펌 대상인지 판별 */
export function isDualConfirmTarget(
  target: string,
): target is DualConfirmTarget {
  return target === "crossview" || target === "podcast";
}
