// ============================================================================
// scripts/ops/merge-duplicate-pairs — 같은 옥천 기사 × 같은 제목의 MBC 기사(뉴스+유튜브) 중복 페어 정리 (#188)
//
// 판정: lib/matching/story.storyKey 가 같은 macro 제목 + 같은 article_micro, status in (approved, candidate).
// 남기는 것: 공론장 글(forum_posts.article_id = macro)이 많은 쪽 → 뉴스(news) → 먼저 만든 것.
// 나머지: status='rejected', confirmations 비움, moderation_logs(cleanup, operator null — 0026·#189,
//         details { kind:'dup_story', keptPairId }) — 상세 페이지는 이 로그로 남은 페어로 넘겨준다.
// 나머지 쪽 macro 기사에 달린 공론장 글이 있으면 article_id 를 남는 쪽 macro 로 옮긴다(댓글 보존).
//
// 실행: pnpm tsx scripts/ops/merge-duplicate-pairs.ts          # 미리보기
//       pnpm tsx scripts/ops/merge-duplicate-pairs.ts --apply  # 적용
// 검증 SQL(0건이어야 함):
//   select article_micro, regexp_replace(lower(a.title),'[^0-9a-z가-힣]','','g') k, count(*)
//   from crossview_pairs p join articles a on a.id=p.article_macro
//   where p.status in ('approved','candidate') group by 1,2 having count(*)>1 and length(regexp_replace(lower(a.title),'[^0-9a-z가-힣]','','g'))>=8;
// ============================================================================

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { kindRank, storyKey } from "../../lib/matching/story";

function loadEnv(): void {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i === -1) continue;
      const k = t.slice(0, i).trim();
      if (process.env[k] === undefined) process.env[k] = t.slice(i + 1).trim();
    }
  } catch {
    /* 셸 env 허용 */
  }
}

interface PairRow {
  id: string;
  article_micro: string;
  article_macro: string;
  status: string;
  created_at: string;
  macro: { title: string | null; kind: string | null } | { title: string | null; kind: string | null }[] | null;
}

async function main(): Promise<void> {
  loadEnv();
  const apply = process.argv.includes("--apply");
  const { createServiceClient } = await import("../../lib/supabase/server");
  const sb = createServiceClient();

  const { data, error } = await sb
    .from("crossview_pairs")
    .select("id, article_micro, article_macro, status, created_at, macro:articles!crossview_pairs_article_macro_fkey(title, kind)")
    .in("status", ["approved", "candidate"])
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as PairRow[];

  const groups = new Map<string, (PairRow & { title: string | null; kind: string | null })[]>();
  for (const r of rows) {
    const m = Array.isArray(r.macro) ? r.macro[0] : r.macro;
    const key = storyKey(m?.title);
    if (!key) continue;
    const g = groups.get(`${r.article_micro}|${key}`) ?? [];
    g.push({ ...r, title: m?.title ?? null, kind: m?.kind ?? null });
    groups.set(`${r.article_micro}|${key}`, g);
  }
  const dups = [...groups.values()].filter((g) => g.length > 1);
  console.log(`페어 ${rows.length}건 · 중복 그룹 ${dups.length}개${apply ? "" : "  (미리보기 — --apply 로 실행)"}\n`);

  for (const g of dups) {
    // 댓글 수
    const macroIds = g.map((p) => p.article_macro);
    const { data: posts } = await sb.from("forum_posts").select("id, article_id").in("article_id", macroIds).is("deleted_at", null);
    const postCount = new Map<string, number>();
    for (const p of (posts ?? []) as { article_id: string }[]) postCount.set(p.article_id, (postCount.get(p.article_id) ?? 0) + 1);

    const sorted = [...g].sort((a, b) => {
      const pa = postCount.get(a.article_macro) ?? 0;
      const pb = postCount.get(b.article_macro) ?? 0;
      if (pa !== pb) return pb - pa;
      if (a.status !== b.status) return a.status === "approved" ? -1 : 1;
      if (kindRank(a.kind) !== kindRank(b.kind)) return kindRank(a.kind) - kindRank(b.kind);
      return a.created_at.localeCompare(b.created_at);
    });
    const keep = sorted[0];
    const drop = sorted.slice(1);
    console.log(`▶ ${keep.title?.slice(0, 50)}  → 남김 ${keep.id.slice(0, 8)} (${keep.kind}, ${keep.status}, 글 ${postCount.get(keep.article_macro) ?? 0})`);
    for (const d of drop) console.log(`     − ${d.id.slice(0, 8)} (${d.kind}, ${d.status}, 글 ${postCount.get(d.article_macro) ?? 0})`);
    if (!apply) continue;

    for (const d of drop) {
      const movePosts = (postCount.get(d.article_macro) ?? 0) > 0 && d.article_macro !== keep.article_macro;
      if (movePosts) {
        const { error: mErr } = await sb.from("forum_posts").update({ article_id: keep.article_macro }).eq("article_id", d.article_macro).is("deleted_at", null);
        if (mErr) throw new Error(`글 이동 실패: ${mErr.message}`);
        console.log(`     글 ${postCount.get(d.article_macro)}건 → ${keep.article_macro.slice(0, 8)} 로 이동`);
      }
      const { error: uErr } = await sb.from("crossview_pairs").update({ status: "rejected", confirmations: {} }).eq("id", d.id);
      if (uErr) throw new Error(`반려 실패(${d.id}): ${uErr.message}`);
      const { error: lErr } = await sb.from("moderation_logs").insert({
        target: "crossview",
        target_id: d.id,
        action: "cleanup", // 0026 — 품질 반려(reject)와 구분, 승인율 집계 제외(#189)
        operator: null,
        reason: "같은 옥천 기사 × 같은 제목의 MBC 기사(뉴스/유튜브) 중복 페어 정리(#188)",
        details: { kind: "dup_story", keptPairId: keep.id, keptMacro: keep.article_macro, droppedMacro: d.article_macro, movedPosts: movePosts },
      });
      if (lErr) throw new Error(`로그 실패(${d.id}): ${lErr.message}`);
    }
  }
  if (apply) console.log(`\n완료 — ${dups.reduce((n, g) => n + g.length - 1, 0)}건 반려(중복 정리).`);
}

main().catch((e) => {
  console.error("[merge-duplicate-pairs] 실패:", e instanceof Error ? e.message : e);
  process.exit(1);
});
