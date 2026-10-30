// 승인된 크로스뷰 중 card_headline이 없는 페어에 짧은 대조 헤드라인(codex)을 생성한다.
// 실행: pnpm tsx scripts/ops/gen-crossview-headlines.ts [limit] [--all]

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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

async function main(): Promise<void> {
  loadEnv();
  const args = process.argv.slice(2);
  const all = args.includes("--all");
  const limit = Number(args.find((a) => !a.startsWith("--")) ?? "20") || 20;

  const { createServiceClient } = await import("../../lib/supabase/server");
  const { generateContrastHeadline } = await import("../../lib/ai/headline");
  const supabase = createServiceClient();

  let query = supabase
    .from("crossview_pairs")
    .select(
      "id, reading_point, summary_macro, summary_micro, card_data, macro:articles!crossview_pairs_article_macro_fkey(title)",
    )
    .eq("status", "approved");
  if (!all) query = query.is("card_headline", null);
  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`조회 실패: ${error.message}`);

  const pairs = (data ?? []) as Array<{
    id: string;
    reading_point: string | null;
    summary_macro: string | null;
    summary_micro: string | null;
    card_data: { headline?: string } | null;
    macro: { title: string } | Array<{ title: string }> | null;
  }>;
  console.log(`헤드라인 생성 대상 ${pairs.length}건`);
  let ok = 0;
  for (const [i, p] of pairs.entries()) {
    try {
      const macro = Array.isArray(p.macro) ? p.macro[0] : p.macro;
      const title = macro?.title?.trim() || p.card_data?.headline?.trim() || p.reading_point?.trim() || "";
      const headline = await generateContrastHeadline({
        title,
        summaryMacro: p.summary_macro,
        summaryMicro: p.summary_micro,
      });
      if (!headline) throw new Error("codex null");
      const { error: upErr } = await supabase
        .from("crossview_pairs")
        .update({ card_headline: headline })
        .eq("id", p.id);
      if (upErr) throw new Error(upErr.message);
      ok += 1;
      console.log(`[${i + 1}/${pairs.length}] ${headline}`);
    } catch (e) {
      console.error(`[${i + 1}/${pairs.length}] 실패: ${e instanceof Error ? e.message : e}`);
    }
  }
  console.log(`완료: ${ok}/${pairs.length}`);
}

main().catch((e) => {
  console.error("헤드라인 생성 실패:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
