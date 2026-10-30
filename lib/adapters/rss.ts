// ============================================================================
// RssAdapter — 범용 RSS 2.0 / Atom 수집 어댑터 (#184 공개 리포 기획 ②, 2026-10-26)
//
// 다른 지역판이 "광역 매체 피드 주소 + 기초 매체 피드 주소"만 넣으면 수집→매칭→온도→팟캐가 돌도록
// 매체에 의존하지 않는 어댑터다. 환경변수:
//   RSS_MACRO_FEED_URL   광역 매체 피드(여러 개면 쉼표로, 최대 5)
//   RSS_MICRO_FEED_URL   기초 매체 피드(여러 개면 쉼표로, 최대 5)
// 피드가 설정된 계층은 레지스트리가 그 계층의 데모·매체 전용 어댑터를 자동으로 내린다(lib/adapters/registry) —
// 증분 커서가 media_source 단위라 한 계층을 두 어댑터가 나눠 쓰면 서로의 과거 기사를 누락시킬 수 있기 때문이다.
//
// 파싱: 의존성 없이 **선형(indexOf) 스캔**으로 <item>(RSS)·<entry>(Atom)를 읽는다(정규식 역추적 없음 — 악성 피드 방어).
//   제목·링크·id·발행일·요약/본문·카테고리. 본문은 HTML 을 벗기고 1,500자까지(요약·비교만 하고 전문은 원문 링크로).
//   발행일이 since 보다 오래된 항목은 건너뛰고, 미래 날짜는 지금으로 보정한다(증분 커서 오염 방지). 댓글은 없다.
// 안전: 자기식별 UA, 피드당 15초·전체 45초, 응답 2MB 상한, 항목 200개 상한, 사설망·루프백·메타데이터 주소(리다이렉트 결과 포함) 거부.
// ============================================================================

import { createHash } from "node:crypto";
import type { MediaSourceAdapter, MediaTier, RawArticle, RawComment } from "./types";

const USER_AGENT = "ZONE2Bot/1.0 (+https://github.com/MBC-ZONE2/zone-2-oss; rss)";
const MAX_FEEDS_PER_TIER = 5;
const MAX_ITEMS_PER_FEED = 200;
const MAX_BODY_CHARS = 1500;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const FEED_TIMEOUT_MS = 15_000;
const TOTAL_BUDGET_MS = 45_000;

export interface RssAdapterOptions {
  /** 레지스트리 id — 같은 계층의 다른 어댑터와 겹치지 않게 */
  id: string;
  tier: MediaTier;
  /** 피드 주소(여러 개 가능) */
  feedUrls: string[];
  /** 기사 종류(기본 news) */
  kind?: RawArticle["kind"];
}

/** 사설망·루프백·링크로컬·메타데이터 주소인가(호스트 문자열 기준 — DNS 는 보지 않는다) */
export function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (h === "169.254.169.254" || h === "metadata.google.internal") return true;
  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
  }
  if (h === "::1" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80")) return true;
  return false;
}

/** 허용되는 피드 주소인가 — http(s) 이고 차단 호스트가 아닌 */
export function isAllowedFeedUrl(u: string): boolean {
  try {
    const url = new URL(u);
    return (url.protocol === "http:" || url.protocol === "https:") && !isBlockedHost(url.hostname);
  } catch {
    return false;
  }
}

/** 환경변수에서 피드 주소 목록을 읽는다(쉼표 구분, 공백 제거, 허용 주소만, 계층당 최대 5) */
export function feedUrlsFromEnv(name: string): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(isAllowedFeedUrl)
    .slice(0, MAX_FEEDS_PER_TIER);
}

// ── 선형 XML 도우미(의존성·역추적 없음) ───────────────────────────────────────────
/** text 에서 from 이후 첫 `<name` 태그의 (열림 끝, 닫힘 시작) 위치. 없으면 null */
function findTag(text: string, name: string, from = 0): { open: number; contentStart: number; contentEnd: number; next: number } | null {
  const lname = name.toLowerCase();
  let i = from;
  while (i < text.length) {
    const lt = text.indexOf("<", i);
    if (lt < 0) return null;
    // 태그 이름 비교(대소문자 무시) — `<name>` 또는 `<name ` 또는 `<name/>`
    const cand = text.slice(lt + 1, lt + 1 + lname.length).toLowerCase();
    const after = text.charAt(lt + 1 + lname.length);
    if (cand === lname && (after === ">" || after === " " || after === "\t" || after === "\n" || after === "/")) {
      const gt = text.indexOf(">", lt);
      if (gt < 0) return null;
      if (text.charAt(gt - 1) === "/") return { open: lt, contentStart: gt + 1, contentEnd: gt + 1, next: gt + 1 }; // 자기 닫힘
      const close = text.indexOf(`</${name}`, gt + 1);
      if (close < 0) {
        // 대소문자 다른 닫힘 태그 — 소문자 비교로 한 번 더
        const lowerIdx = text.toLowerCase().indexOf(`</${lname}`, gt + 1);
        if (lowerIdx < 0) return null;
        const end = text.indexOf(">", lowerIdx);
        return { open: lt, contentStart: gt + 1, contentEnd: lowerIdx, next: end < 0 ? text.length : end + 1 };
      }
      const end = text.indexOf(">", close);
      return { open: lt, contentStart: gt + 1, contentEnd: close, next: end < 0 ? text.length : end + 1 };
    }
    i = lt + 1;
  }
  return null;
}

function unwrapCdata(v: string): string {
  const t = v.trim();
  if (t.startsWith("<![CDATA[") && t.endsWith("]]>")) return t.slice(9, -3);
  return t;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,8});/gi, (m, body: string) => {
    try {
      if (body[0] === "#") {
        const cp = body[1].toLowerCase() === "x" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
        if (!Number.isFinite(cp) || cp <= 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return "";
        return String.fromCodePoint(cp);
      }
      return ENTITIES[body.toLowerCase()] ?? m;
    } catch {
      return "";
    }
  });
}

/** 첫 `<name>` 의 텍스트(CDATA 해제·trim). 없으면 null */
function tagText(block: string, name: string): string | null {
  const t = findTag(block, name);
  return t ? unwrapCdata(block.slice(t.contentStart, t.contentEnd)) : null;
}

/** 모든 `<name>` 텍스트 */
function tagTexts(block: string, name: string): string[] {
  const out: string[] = [];
  let from = 0;
  for (let guard = 0; guard < 50; guard += 1) {
    const t = findTag(block, name, from);
    if (!t) break;
    out.push(unwrapCdata(block.slice(t.contentStart, t.contentEnd)));
    from = t.next;
  }
  return out;
}

/** 링크 — RSS <link>텍스트</link> 또는 Atom <link href rel="alternate"/>. 상대 주소는 피드 주소 기준으로 푼다 */
function linkOf(block: string, feedUrl: string): string | null {
  const candidates: string[] = [];
  let from = 0;
  for (let guard = 0; guard < 20; guard += 1) {
    const t = findTag(block, "link", from);
    if (!t) break;
    const openTag = block.slice(t.open, t.contentStart);
    const href = openTag.match(/\bhref=["']([^"']+)["']/i)?.[1];
    const rel = openTag.match(/\brel=["']([^"']+)["']/i)?.[1]?.toLowerCase();
    const text = block.slice(t.contentStart, t.contentEnd).trim();
    if (href && (!rel || rel === "alternate")) candidates.unshift(decodeEntities(href));
    else if (href) candidates.push(decodeEntities(href));
    if (text) candidates.unshift(decodeEntities(unwrapCdata(text)));
    from = t.next;
  }
  for (const c of candidates) {
    try {
      const u = new URL(c, feedUrl);
      if ((u.protocol === "http:" || u.protocol === "https:") && !isBlockedHost(u.hostname)) return u.toString();
    } catch {
      /* 다음 후보 */
    }
  }
  return null;
}

/** HTML → 평문(태그 제거, 공백 정리). 엔티티로 감싸인 HTML(Atom type="html")도 한 번 더 푼다 */
function stripHtml(html: string): string {
  const once = decodeEntities(html);
  let out = "";
  let inTag = false;
  for (let i = 0; i < once.length; i += 1) {
    const ch = once[i];
    if (ch === "<") {
      inTag = true;
      // 블록 요소·줄바꿈 태그는 줄바꿈으로
      const rest = once.slice(i + 1, i + 6).toLowerCase();
      if (rest.startsWith("br") || rest.startsWith("/p") || rest.startsWith("/div") || rest.startsWith("/li") || /^\/h[1-6]/.test(rest)) out += "\n";
      continue;
    }
    if (ch === ">") {
      inTag = false;
      continue;
    }
    if (!inTag) out += ch;
  }
  return decodeEntities(out).replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function toIso(v: string | null, nowMs: number): string | null {
  if (!v) return null;
  const t = Date.parse(v);
  if (!Number.isFinite(t)) return null;
  // 미래 날짜는 지금으로 — 한 항목이 source 증분 커서를 미래로 밀지 않게
  return new Date(Math.min(t, nowMs)).toISOString();
}

/** 항목 하나 → RawArticle(없으면 null). 예외는 밖에서 항목 단위로 격리한다 */
export function parseFeedItem(block: string, kind: RawArticle["kind"], feedUrl: string, nowMs = Date.now()): RawArticle | null {
  const title = decodeEntities(tagText(block, "title") ?? "").replace(/\s+/g, " ").trim();
  const url = linkOf(block, feedUrl);
  if (!title || !url) return null;
  const guid = tagText(block, "guid") ?? tagText(block, "id") ?? url;
  const publishedAt =
    toIso(tagText(block, "pubDate"), nowMs) ??
    toIso(tagText(block, "published"), nowMs) ??
    toIso(tagText(block, "dc:date"), nowMs) ??
    toIso(tagText(block, "updated"), nowMs);
  if (!publishedAt) return null;
  const bodyRaw = tagText(block, "content:encoded") ?? tagText(block, "content") ?? tagText(block, "description") ?? tagText(block, "summary") ?? "";
  const body = stripHtml(bodyRaw).slice(0, MAX_BODY_CHARS);
  const categories = tagTexts(block, "category")
    .map((c) => stripHtml(c).trim())
    .filter(Boolean);
  // 기사 id 는 원문 링크 기준 — 피드가 달라도 같은 기사는 같은 행, 숫자 guid 재사용에도 안전
  const externalId = `rss-${createHash("sha1").update(url).digest("hex").slice(0, 16)}`;
  return {
    externalId,
    url,
    title,
    body,
    category: categories[0],
    keywords: categories.length ? categories.slice(0, 8) : undefined,
    publishedAt,
    kind,
    raw: { feedGuid: guid, feed: feedUrl, bodyScope: "rss summary(≤1500자) — 전문은 원문 링크" },
  };
}

/** 피드 문서 → 항목 블록(선형 스캔, 최대 MAX_ITEMS_PER_FEED) */
export function splitFeedItems(xml: string, max = MAX_ITEMS_PER_FEED): string[] {
  const out: string[] = [];
  for (const name of ["item", "entry"] as const) {
    let from = 0;
    while (out.length < max) {
      const t = findTag(xml, name, from);
      if (!t) break;
      out.push(xml.slice(t.contentStart, t.contentEnd));
      from = t.next;
    }
    if (out.length) break; // RSS 면 item 만, Atom 이면 entry 만
  }
  return out;
}

/** 피드를 받아 문자열로(2MB 상한, 리다이렉트 결과 호스트도 검사) */
async function fetchFeed(url: string, timeoutMs: number): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/rss+xml, application/atom+xml, application/xml;q=0.9, */*;q=0.5" },
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
    if (!res.ok) {
      console.warn(`[rss] ${url} → ${res.status}`);
      return null;
    }
    if (!isAllowedFeedUrl(res.url || url)) {
      console.warn(`[rss] ${url} → 차단 호스트로 리다이렉트`);
      return null;
    }
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > MAX_RESPONSE_BYTES) {
      console.warn(`[rss] ${url} → ${len}B, 상한 초과`);
      return null;
    }
    const reader = res.body?.getReader();
    if (!reader) return await res.text();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        console.warn(`[rss] ${url} → 본문 ${MAX_RESPONSE_BYTES}B 초과, 중단`);
        return null;
      }
      chunks.push(value);
    }
    return new TextDecoder("utf-8").decode(Buffer.concat(chunks.map((c) => Buffer.from(c))));
  } catch (e) {
    console.warn(`[rss] ${url} 실패:`, e instanceof Error ? e.message : e);
    return null;
  }
}

/** 범용 RSS/Atom 어댑터를 만든다 */
export function createRssAdapter(opts: RssAdapterOptions): MediaSourceAdapter {
  const kind = opts.kind ?? "news";
  const feeds = opts.feedUrls.filter(isAllowedFeedUrl).slice(0, MAX_FEEDS_PER_TIER);
  return {
    id: opts.id,
    tier: opts.tier,
    async fetchArticles(since: Date): Promise<RawArticle[]> {
      const started = Date.now();
      const out: RawArticle[] = [];
      const seen = new Set<string>();
      for (const url of feeds) {
        const left = TOTAL_BUDGET_MS - (Date.now() - started);
        if (left <= 1000) {
          console.warn("[rss] 전체 시간 예산 소진 — 남은 피드 건너뜀");
          break;
        }
        const xml = await fetchFeed(url, Math.min(FEED_TIMEOUT_MS, left));
        if (!xml) continue;
        const nowMs = Date.now();
        for (const block of splitFeedItems(xml)) {
          let a: RawArticle | null = null;
          try {
            a = parseFeedItem(block, kind, url, nowMs);
          } catch {
            continue; // 항목 하나의 이상이 피드 전체를 막지 않게
          }
          if (!a || seen.has(a.externalId)) continue;
          if (Date.parse(a.publishedAt) < since.getTime()) continue;
          seen.add(a.externalId);
          out.push(a);
        }
      }
      return out;
    },
    async fetchComments(): Promise<RawComment[]> {
      return [];
    },
  };
}
