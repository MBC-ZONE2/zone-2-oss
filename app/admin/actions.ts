// ============================================================================
// app/admin/actions — 관리자 서버 액션
//
// 로그아웃: Supabase 세션 종료 후 로그인 페이지로 이동.
// ============================================================================

"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** 로그아웃 — 세션을 종료하고 /admin/login 으로 리다이렉트한다. */
export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}
