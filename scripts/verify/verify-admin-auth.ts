import type { User } from "@supabase/supabase-js";
import {
  extractRole,
  isAssignableAdminRole,
  roleHasPermission,
} from "../../lib/auth";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`PASS: ${message}`);
}

const base = {
  id: "00000000-0000-0000-0000-000000000001",
  aud: "authenticated",
  created_at: new Date(0).toISOString(),
} as User;

assert(
  extractRole({ ...base, app_metadata: {}, user_metadata: { role: "super_admin" } }) === null,
  "사용자가 수정 가능한 user_metadata.role 은 무시한다",
);
assert(
  extractRole({ ...base, app_metadata: { role: "operator_mbc" }, user_metadata: {} }) ===
    "operator_mbc",
  "app_metadata.role 만 신뢰한다",
);
assert(isAssignableAdminRole("super_admin"), "관리자 역할을 부여할 수 있다");
assert(isAssignableAdminRole("operator_mbc"), "MBC충북 기자 역할을 부여할 수 있다");
assert(isAssignableAdminRole("operator_oki"), "옥천신문 기자 역할을 부여할 수 있다");
assert(!isAssignableAdminRole("viewer"), "레거시 viewer 는 신규 부여 대상이 아니다");
assert(
  roleHasPermission("super_admin", "users.manage"),
  "관리자만 계정·권한 관리 권한을 가진다",
);
assert(
  !roleHasPermission("operator_mbc", "users.manage") &&
    !roleHasPermission("operator_oki", "users.manage"),
  "기자 역할은 다른 계정 권한을 바꿀 수 없다",
);
