// ============================================================================
// GET /api/forum/captcha — 자동등록방지 문제 발급 (lib/forum/captcha). 응답 { data: { token, question } }
// ============================================================================

import { issueCaptcha, ok } from "@/lib/forum";

export const dynamic = "force-dynamic";

export async function GET() {
  const res = ok(await issueCaptcha());
  res.headers.set("cache-control", "no-store");
  return res;
}
