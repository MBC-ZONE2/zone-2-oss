// ============================================================================
// lib/matching/story — "같은 기사(story)" 판정과 중복 페어 차단 (#188, 2026-10-19)
//
// MBC충북은 한 사안을 CMS 기사(kind=news)와 유튜브 영상(kind=youtube)으로 **같은 제목**으로 두 번 낸다.
// 매칭 엔진은 기사 id 단위로 돌아 옥천신문 기사 1건이 그 둘과 각각 페어가 됐고, 목록 맨 위에 같은 사안이
// 두 줄 연속으로 떴다(10/8 장동혁 대표 옥천 방문). 중복 수집이 아니라 매체의 발행 방식이다.
//
// 규칙: 제목을 정규화한 storyKey 가 같으면 같은 기사로 본다(8자 미만의 짧은 제목은 판정하지 않는다 —
// "옥천군"·"R)" 같은 잘린 제목이 엉뚱한 것을 묶지 않게). 한 옥천 기사(micro)에 대해 같은 storyKey 의
// MBC 기사(macro)는 페어를 하나만 둔다.
//   · 매칭 단계(engine): 후보 가운데 이미 페어가 있는 story 는 버리고, 한 실행 안에서도 같은 story 는
//     뉴스(news) > 유사도 순으로 하나만 남긴다.
//   · 목록(queries.listApprovedPairs): 페이지 안에서 같은 (micro, storyKey) 는 첫 건만 — 정리 전 데이터 안전망.
//   · 기존 데이터: scripts/ops/merge-duplicate-pairs.ts 로 정리(댓글 있는 쪽 → 뉴스 → 먼저 만든 것 순으로 남김).
// 순수 함수 위주. DB 접근은 filterStoryDuplicates 만.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Article } from "@/types";
import type { MatchCandidate } from "./types";

/** 이보다 짧은 정규화 제목은 story 판정에 쓰지 않는다 */
export const STORY_KEY_MIN_LEN = 8;

/** 제목 → story 키. 머리표([단독]·(종합)·R)) 와 기호·공백을 걷어낸 소문자. 짧으면 null */
export function storyKey(title: string | null | undefined): string | null {
  if (!title) return null;
  const k = title
    .toLowerCase()
    .replace(/\[[^\]]*\]|\([^)]*\)/g, " ")
    .replace(/^\s*r\)\s*/i, " ")
    .replace(/[^0-9a-z가-힣]/g, "");
  return k.length >= STORY_KEY_MIN_LEN ? k : null;
}

/** 같은 story 인가 (둘 다 키가 있어야 한다) */
export function sameStory(a: string | null | undefined, b: string | null | undefined): boolean {
  const ka = storyKey(a);
  const kb = storyKey(b);
  return ka !== null && kb !== null && ka === kb;
}

/** 중복 페어 정리·후보 선택에 쓰는 우선순위 — 뉴스(CMS) 가 유튜브보다 앞 */
export function kindRank(kind: string | null | undefined): number {
  return kind === "news" ? 0 : 1;
}

/**
 * 한 실행 안의 후보 가운데 같은 story 는 하나만 남긴다 — 뉴스 우선, 그다음 유사도.
 * (기준 기사가 옥천 기사이고 후보가 같은 제목의 MBC 뉴스+유튜브일 때)
 */
export function collapseSameStoryCandidates(candidates: MatchCandidate[]): MatchCandidate[] {
  const byKey = new Map<string, MatchCandidate>();
  const out: MatchCandidate[] = [];
  for (const c of candidates) {
    const key = storyKey(c.article.title);
    if (!key) {
      out.push(c);
      continue;
    }
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, c);
      continue;
    }
    const better =
      kindRank(c.article.kind) < kindRank(prev.article.kind) ||
      (kindRank(c.article.kind) === kindRank(prev.article.kind) && c.similarity > prev.similarity);
    if (better) byKey.set(key, c);
  }
  return [...out, ...byKey.values()].sort((a, b) => b.similarity - a.similarity);
}

/** 이미 있는 페어(반려 제외)의 (micro id → macro 제목들) */
type ExistingMap = Map<string, { macroId: string; title: string | null }[]>;

async function loadExistingPairs(supabase: SupabaseClient, microIds: string[]): Promise<ExistingMap> {
  const map: ExistingMap = new Map();
  if (microIds.length === 0) return map;
  const { data, error } = await supabase
    .from("crossview_pairs")
    .select("article_micro, article_macro, macro:articles!crossview_pairs_article_macro_fkey(title)")
    .in("article_micro", microIds)
    .neq("status", "rejected");
  if (error) throw new Error(`기존 페어 조회 실패: ${error.message}`);
  for (const r of (data ?? []) as unknown as { article_micro: string; article_macro: string; macro: { title: string | null } | { title: string | null }[] | null }[]) {
    const m = Array.isArray(r.macro) ? r.macro[0] : r.macro;
    const list = map.get(r.article_micro) ?? [];
    list.push({ macroId: r.article_macro, title: m?.title ?? null });
    map.set(r.article_micro, list);
  }
  return map;
}

/**
 * 후보 가운데 "그 옥천 기사에 같은 story 의 MBC 기사가 이미 페어로 있는" 것을 뺀다.
 * @returns 남은 후보와 뺀 개수
 */
export async function filterStoryDuplicates(
  supabase: SupabaseClient,
  base: Article,
  candidates: MatchCandidate[],
): Promise<{ candidates: MatchCandidate[]; skipped: number }> {
  if (candidates.length === 0) return { candidates, skipped: 0 };
  const baseIsMacro = base.source === "mbc_cb";
  const collapsed = baseIsMacro ? candidates : collapseSameStoryCandidates(candidates);
  let skipped = candidates.length - collapsed.length;

  const microIds = baseIsMacro ? collapsed.map((c) => c.article.id) : [base.id];
  const existing = await loadExistingPairs(supabase, microIds);
  if (existing.size === 0) return { candidates: collapsed, skipped };

  const kept = collapsed.filter((c) => {
    const macro = baseIsMacro ? base : c.article;
    const microId = baseIsMacro ? c.article.id : base.id;
    const dup = (existing.get(microId) ?? []).some((p) => p.macroId !== macro.id && sameStory(p.title, macro.title));
    if (dup) skipped += 1;
    return !dup;
  });
  return { candidates: kept, skipped };
}
