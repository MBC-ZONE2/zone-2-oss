// ============================================================================
// lib/visits — 자체 방문 기록 (검증지표 ④ 재방문율 · KPI 순방문자, #181)
//
// 브라우저가 localStorage 에 둔 무작위 ID(UUID) 를 하루 한 번 POST /api/visit 로 보내면,
// 서버는 sha256(ID + VISIT_HASH_PEPPER) 와 KST 날짜만 site_visits 에 남긴다.
// IP·UA·쿠키·원 ID 는 저장하지 않는다(docs-site/guide/data.md 개인정보 절).
//   순방문자(기간) = distinct visitor_hash
//   재방문율(기간) = 방문일 ≥ 2 인 visitor ÷ 순방문자
// pepper 가 없으면 운영에서는 기록하지 않고 system_alerts 로 알린다(lib/forum/hash 와 같은 원칙).
// ============================================================================

import { z } from "zod";

/** POST /api/visit 본문 */
export const visitBodySchema = z.object({
  id: z.string().uuid(),
  path: z
    .string()
    .min(1)
    .max(200)
    .regex(/^\/[^\s]*$/, "경로는 / 로 시작해야 합니다"),
});
export type VisitBody = z.infer<typeof visitBodySchema>;

/** 봇·크롤러·미리보기 UA — 방문으로 세지 않는다 */
export const BOT_UA_RE = /bot|crawl|spider|headless|preview|lighthouse|slurp|facebookexternalhit|whatsapp|telegram|discord|curl|wget|python-requests/i;

/** localStorage 키(클라이언트와 공유) */
export const VISIT_ID_KEY = "z2_vid";
export const VISIT_DAY_KEY = "z2_vday";

/** pepper — 운영 필수. 없으면 null(호출부가 기록 중단 + 경보). */
export function getVisitPepper(): string | null {
  const v = process.env.VISIT_HASH_PEPPER?.trim();
  return v ? v : null;
}

/** 쿼리스트링·해시 제거, 200자 제한 */
export function cleanPath(path: string): string {
  const cut = path.split(/[?#]/)[0] || "/";
  return cut.slice(0, 200);
}

/**
 * 저장용 구역 — 첫 경로 조각만("/", "/forum", "/podcast", "/crossview", "/notices", "/temperature").
 * 글·회차 id 까지 남기면 영구 해시와 묶여 날짜별 열람 이력이 되므로(codex 리뷰) 구역 단위로 줄인다.
 */
export function sectionOf(path: string): string {
  const seg = cleanPath(path).split("/")[1] ?? "";
  return seg ? `/${seg.slice(0, 32)}` : "/";
}

/** 보존 기간 — 이보다 오래된 행은 지운다(개인정보 고지와 같은 값) */
export const RETENTION_DAYS = 180;

/** 요청 본문 상한(바이트) — UUID + 경로면 200자면 충분 */
export const MAX_BODY_BYTES = 1024;

/**
 * 같은 사이트에서 온 요청인가 — sendBeacon/fetch 는 Origin 을 붙인다. Origin 이 없으면 Sec-Fetch-Site 로,
 * 둘 다 없으면(구형 UA) 통과시킨다. 다른 사이트에서 UUID 를 뿌려 순방문자를 부풀리는 것을 막는 1차 선.
 */
export function isSameSite(headers: Headers): boolean {
  const host = headers.get("host");
  const origin = headers.get("origin");
  if (origin) {
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }
  const sfs = headers.get("sec-fetch-site");
  if (sfs) return sfs === "same-origin" || sfs === "none";
  return true;
}

/** 관리자 화면은 방문으로 세지 않는다 */
export function isExcludedPath(path: string): boolean {
  return path === "/admin" || path.startsWith("/admin/") || path.startsWith("/api/");
}

/** KST 기준 YYYY-MM-DD */
export function kstDateOf(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** sha256(pepper:visit:id) → hex. Web Crypto(Node/Edge 공용). */
export async function hashVisitor(id: string, pepper: string): Promise<string> {
  const data = new TextEncoder().encode(`${pepper}:visit:${id}`);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(digest);
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, "0");
  return out;
}

// ── 어뷰징 완충 — 같은 IP 분당 30회·하루 300회 초과는 무시. IP 는 메모리 카운터에만, 저장하지 않는다.
//    (단일 인스턴스 launchd 서버 전제. IP 는 Cloudflare 터널의 cf-connecting-ip 라 바깥에서 위조할 수 없다.)
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 30;
const DAILY_MAX = 300;
const buckets = new Map<string, { start: number; n: number }>();
const dayBuckets = new Map<string, number>();
let dayBucketDate = "";

/** @returns true 면 허용, false 면 초과(무시) */
export function allowVisitFromIp(ip: string | null, now = Date.now(), day = kstDateOf(new Date(now))): boolean {
  const key = ip ?? "unknown";
  // 일일 상한 — 날짜가 바뀌면 통째로 비운다
  if (dayBucketDate !== day) {
    dayBuckets.clear();
    dayBucketDate = day;
  }
  const d = (dayBuckets.get(key) ?? 0) + 1;
  dayBuckets.set(key, d);
  if (d > DAILY_MAX) return false;

  const b = buckets.get(key);
  if (!b || now - b.start >= RATE_WINDOW_MS) {
    buckets.set(key, { start: now, n: 1 });
    // 가끔 오래된 버킷을 비운다(메모리 상한)
    if (buckets.size > 5000) {
      for (const [k, v] of buckets) if (now - v.start >= RATE_WINDOW_MS) buckets.delete(k);
    }
    return true;
  }
  b.n += 1;
  return b.n <= RATE_MAX;
}
