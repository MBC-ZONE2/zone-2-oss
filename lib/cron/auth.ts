// ============================================================================
// lib/cron/auth — /api/cron/* 공용 CRON_SECRET 검증(상수 시간 비교). 보안 검수 2026-10-26: 라우트마다 제각각이던 비교를 통일.
// ============================================================================

import { timingSafeEqual } from "node:crypto";

/** Authorization: Bearer <CRON_SECRET> 인가. 시크릿 미설정이면 항상 거부 */
export function isCronAuthorized(headers: Headers): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
