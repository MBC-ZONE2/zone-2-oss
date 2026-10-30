// ============================================================================
// lib/temperature/recent-comments — 이슈 키워드 매칭 최근 댓글(상세 페이지 레일용)
//
// 서버 전용(anon + RLS). /temperature/[issueId] 데스크탑 aside 에 3건만 보여준다.
//   · 키워드는 최대 3개(MAX_KEYWORDS)만 쓰고, ilike 메타문자(% _ \)는 백슬래시로
//     이스케이프한다. PostgREST or() 문법·패턴을 깨는 문자(, ( ) " ' *)가 든 키워드는 건너뛴다.
//   · 최근 7일(published_at gte) 로만 훑고 limit 3 — 선행 와일드카드 OR 검색이
//     드문 키워드에서 댓글 테이블 전체를 스캔하지 않도록 기간을 자른다.
//   · 키워드가 없거나 조회 실패 → 빈 배열(페이지는 그대로 뜬다).
// ============================================================================

import { createClient } from "@/lib/supabase/server";
import type { MediaSource } from "@/types";

/** 최근 댓글 한 건(레일 표시용) */
export interface RecentComment {
  id: string;
  source: MediaSource;
  body: string;
  publishedAt: string | null;
}

/** OR 검색에 넣는 키워드 수 상한 */
export const MAX_KEYWORDS = 3;
/** 최근 댓글 조회 기간(일) */
export const RECENT_LOOKBACK_DAYS = 7;
/** 기본 건수 */
const DEFAULT_LIMIT = 3;
/** 키워드 최대 길이 — 패턴 폭주 방지 */
const MAX_KEYWORD_LEN = 40;

/** PostgREST or() 문법(, ( ) " ')이나 like 별표 변환(*)을 깨는 문자 — 이런 키워드는 제외 */
const RESERVED_RE = /[,()"'*]/;

/** ilike 패턴 메타문자(\ % _) 이스케이프 — Postgres 기본 ESCAPE 문자는 백슬래시 */
export function escapeIlikePattern(keyword: string): string {
  return keyword.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/**
 * 키워드 배열을 or() 에 넣을 수 있는 안전한 목록으로 정리한다(순수).
 * 공백 정리 → 빈값·너무 긴 값·예약문자 포함 값 제외 → 중복 제거 → 최대 MAX_KEYWORDS 개.
 */
export function sanitizeKeywords(keywords: string[] | null | undefined): string[] {
  const out: string[] = [];
  for (const raw of keywords ?? []) {
    const k = raw.replace(/\s+/g, " ").trim();
    if (k.length === 0 || k.length > MAX_KEYWORD_LEN || RESERVED_RE.test(k)) continue;
    if (out.includes(k)) continue;
    out.push(k);
    if (out.length >= MAX_KEYWORDS) break;
  }
  return out;
}

/** 키워드 목록 → PostgREST or() 필터 문자열 (예: body.ilike.%옥천\_군수%,body.ilike.%도로%) */
export function buildRecentCommentsFilter(keywords: string[]): string {
  return keywords.map((k) => `body.ilike.%${escapeIlikePattern(k)}%`).join(",");
}

/**
 * 이슈 키워드에 매칭되는 최근 댓글(기본 3건, 최근 7일). 매칭 기준은 감정 분포와 같은
 * 키워드 substring(ilike). 실패는 모두 빈 배열로 흡수한다.
 */
export async function getRecentComments(
  keywords: string[] | null,
  limit = DEFAULT_LIMIT,
): Promise<RecentComment[]> {
  const safe = sanitizeKeywords(keywords);
  if (safe.length === 0) return [];
  const since = new Date(Date.now() - RECENT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("comments")
      .select("id, source, body, published_at")
      .gte("published_at", since.toISOString())
      .or(buildRecentCommentsFilter(safe))
      .order("published_at", { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return (data as { id: string; source: MediaSource; body: string; published_at: string | null }[]).map(
      (r) => ({ id: r.id, source: r.source, body: r.body, publishedAt: r.published_at }),
    );
  } catch {
    return [];
  }
}
