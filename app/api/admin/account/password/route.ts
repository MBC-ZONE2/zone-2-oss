// ============================================================================
// POST /api/admin/account/password — 내 비밀번호 변경 (이메일 계정 전용)
//
// 본문: { currentPassword, newPassword }
// 순서: 세션 사용자(getAuthUser) → 현재 비밀번호를 anon 클라이언트 signInWithPassword 로 검증
//       → service role 로 새 비밀번호 저장. 세션 쿠키가 SSOT 라 다른 사람 계정은 건드릴 수 없다.
// 카카오 등 소셜 계정은 비밀번호가 없으므로 400. 새 비밀번호는 8자 이상, 현재와 달라야 한다.
// ============================================================================

import { z } from "zod";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { errorResponse, extractProvider, getAuthUser, okResponse } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";

const schema = z.object({
  currentPassword: z.string().min(1, "현재 비밀번호를 입력해 주세요."),
  newPassword: z
    .string()
    .min(8, "새 비밀번호는 8자 이상이어야 합니다.")
    .max(72, "비밀번호가 너무 깁니다."),
});

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) return errorResponse(401, "UNAUTHORIZED", "로그인이 필요합니다.");
  if (!user.email || extractProvider(user) !== "email") {
    return errorResponse(400, "NOT_PASSWORD_ACCOUNT", "이메일·비밀번호 계정만 비밀번호를 바꿀 수 있습니다.");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "BAD_JSON", "요청 본문이 JSON 이 아닙니다.");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(400, "INVALID", parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요.");
  }
  const { currentPassword, newPassword } = parsed.data;
  if (currentPassword === newPassword) {
    return errorResponse(400, "SAME_PASSWORD", "현재 비밀번호와 다른 값을 써 주세요.");
  }

  // 현재 비밀번호 검증 — 세션을 만들지 않는 일회용 anon 클라이언트
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return errorResponse(500, "CONFIG", "인증 설정이 없습니다.");
  const probe = createSupabaseClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { error: verifyError } = await probe.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });
  if (verifyError) {
    return errorResponse(403, "WRONG_PASSWORD", "현재 비밀번호가 올바르지 않습니다.");
  }

  const service = createServiceClient();
  const { error } = await service.auth.admin.updateUserById(user.id, { password: newPassword });
  if (error) {
    console.error("[account/password] 변경 실패:", error.message);
    return errorResponse(500, "UPDATE_FAILED", "비밀번호를 바꾸지 못했습니다. 잠시 뒤 다시 시도해 주세요.");
  }
  return okResponse({ changed: true });
}
