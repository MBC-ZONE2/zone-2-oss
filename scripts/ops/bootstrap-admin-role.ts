import { createClient } from "@supabase/supabase-js";

const userId = process.argv[2];
if (!userId || !/^[0-9a-f-]{36}$/i.test(userId)) {
  throw new Error("사용법: pnpm admin:bootstrap <auth-user-uuid>");
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY가 필요합니다.");
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data: current, error: readError } = await supabase.auth.admin.getUserById(userId);
if (readError || !current.user) {
  throw new Error(`계정 조회 실패: ${readError?.message ?? "not found"}`);
}
const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
  app_metadata: { ...(current.user.app_metadata ?? {}), role: "super_admin" },
});
if (updateError) throw new Error(`관리자 지정 실패: ${updateError.message}`);

console.log("첫 관리자 역할 지정 완료");
