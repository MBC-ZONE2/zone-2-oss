// ============================================================================
// POST /api/visit — 하루 1회 익명 방문 기록 (검증지표 ④ 재방문율 · KPI 순방문자, #181)
//
// 본문 { id: UUID, path } — 클라이언트(components/visit-ping)가 navigator.sendBeacon 으로 보낸다.
// 저장: site_visits(visitor_hash = sha256(id + VISIT_HASH_PEPPER), visit_date = KST 오늘, first_path).
// 무시(204): 봇 UA · 다른 사이트 Origin · 본문 1KB 초과 · /admin 경로 · pepper 미설정(경보 1회)
//           · 같은 IP 분당 30회/하루 300회 초과 · 잘못된 본문.
// 저장 경로는 구역 단위(/forum 등)뿐, 180일 지난 행은 가끔 지운다(보존 기간).
// 어떤 경우에도 204 — 클라이언트는 결과를 쓰지 않고, 실패가 화면에 드러날 이유가 없다.
// ============================================================================

import type { NextRequest } from "next/server";
import { recordAlertOnce } from "@/lib/alerts";
import { clientIpFrom } from "@/lib/forum/secret";
import { createServiceClient } from "@/lib/supabase/server";
import {
  BOT_UA_RE,
  MAX_BODY_BYTES,
  RETENTION_DAYS,
  allowVisitFromIp,
  cleanPath,
  getVisitPepper,
  hashVisitor,
  isExcludedPath,
  isSameSite,
  kstDateOf,
  sectionOf,
  visitBodySchema,
} from "@/lib/visits";

export const dynamic = "force-dynamic";

const NO_CONTENT = () => new Response(null, { status: 204 });

/** pepper 미설정 경보는 프로세스당 한 번만 DB 에 확인한다 */
let pepperWarned = false;

export async function POST(request: NextRequest) {
  const ua = request.headers.get("user-agent") ?? "";
  if (!ua || BOT_UA_RE.test(ua)) return NO_CONTENT();
  if (!isSameSite(request.headers)) return NO_CONTENT();

  // sendBeacon 은 text/plain 또는 Blob(application/json) 으로 온다 — 본문을 문자열로 받아 파싱
  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return NO_CONTENT();
    body = JSON.parse(text);
  } catch {
    return NO_CONTENT();
  }
  const parsed = visitBodySchema.safeParse(body);
  if (!parsed.success) return NO_CONTENT();

  const path = cleanPath(parsed.data.path);
  if (isExcludedPath(path)) return NO_CONTENT();

  if (!allowVisitFromIp(clientIpFrom(request.headers))) return NO_CONTENT();

  const pepper = getVisitPepper();
  const supabase = createServiceClient();
  if (!pepper) {
    if (!pepperWarned && process.env.NODE_ENV === "production") {
      pepperWarned = true;
      await recordAlertOnce(
        supabase,
        "visit_pepper_missing",
        "VISIT_HASH_PEPPER 가 설정되지 않아 방문 기록(재방문율·순방문자)을 남기지 않습니다 — .env.local 에 추가 후 서버 재기동",
        { severity: "error", dedupeKey: "pepper" },
      );
    }
    return NO_CONTENT();
  }

  try {
    const visitor_hash = await hashVisitor(parsed.data.id, pepper);
    const today = kstDateOf();
    const { error } = await supabase
      .from("site_visits")
      .upsert(
        { visitor_hash, visit_date: today, first_path: sectionOf(path) },
        { onConflict: "visitor_hash,visit_date", ignoreDuplicates: true },
      );
    if (error) console.error("[visit] 기록 실패:", error.message);
    // 보존 기간 — 요청 200건에 1번꼴로 오래된 행을 지운다(별도 크론 없이).
    // 지우기 전에 일별 집계(site_visits_daily)를 같은 트랜잭션에서 먼저 채우는 DB 함수(0029)를 부른다 —
    // 누적 방문 수가 보존 기간 뒤에도 줄지 않도록.
    if (Math.random() < 0.005) {
      const cutoff = new Date(`${today}T00:00:00+09:00`);
      cutoff.setUTCDate(cutoff.getUTCDate() - RETENTION_DAYS);
      const { error: delErr } = await supabase.rpc("site_visits_prune", { p_cutoff: cutoff.toISOString().slice(0, 10) });
      if (delErr) console.error("[visit] 보존 기간 정리 실패:", delErr.message);
    }
  } catch (e) {
    console.error("[visit] 기록 실패:", e instanceof Error ? e.message : e);
  }
  return NO_CONTENT();
}
