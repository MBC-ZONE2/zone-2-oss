// ============================================================================
// scripts/ops/merge-duplicate-issues — 같은 사안의 이슈 변형들을 하나로 합친다 (#183 후속)
//
// 판정 규칙은 lib/temperature/dedupe(isSameIssue). 그룹마다 **가장 먼저 만들어진 이슈**를 남기고
// 나머지의 키워드를 합친 뒤(상한 8) 나머지 행을 지운다 — temperature_scores 는 FK ON DELETE CASCADE 라
// 변형들의 온도 추이는 함께 사라진다(같은 사안의 흩어진 기록이므로 손실로 보지 않는다).
//
// 실행: pnpm tsx scripts/ops/merge-duplicate-issues.ts          # 미리보기(변경 없음)
//       pnpm tsx scripts/ops/merge-duplicate-issues.ts --apply  # 실제 병합
// 필요 env(.env.local 자동 로드): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// ============================================================================

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { groupDuplicates, mergeKeywords } from "../../lib/temperature/dedupe";

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

interface Row {
  id: string;
  label: string;
  keywords: string[] | null;
  created_at: string;
}

async function main(): Promise<void> {
  loadEnv();
  const apply = process.argv.includes("--apply");
  const { createServiceClient } = await import("../../lib/supabase/server");
  const sb = createServiceClient();

  const { data, error } = await sb.from("issues").select("id, label, keywords, created_at").order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Row[];
  const groups = groupDuplicates(rows).filter((g) => g.length > 1);
  const removed = groups.reduce((n, g) => n + g.length - 1, 0);
  console.log(`이슈 ${rows.length}건 · 중복 그룹 ${groups.length}개 · 지울 변형 ${removed}건 → 남는 이슈 ${rows.length - removed}건${apply ? "" : "  (미리보기 — --apply 로 실행)"}\n`);

  for (const g of groups) {
    const keep = g[0];
    const merged = mergeKeywords(keep.keywords, g.slice(1).flatMap((r) => r.keywords ?? []));
    console.log(`▶ ${keep.label} (${keep.created_at.slice(0, 10)}) ← ${g.length - 1}건`);
    for (const r of g.slice(1)) console.log(`     − ${r.label} (${r.created_at.slice(0, 10)})`);
    console.log(`     키워드: ${merged.join(", ")}`);
    if (!apply) continue;
    const { error: uErr } = await sb.from("issues").update({ keywords: merged }).eq("id", keep.id);
    if (uErr) throw new Error(`키워드 갱신 실패(${keep.label}): ${uErr.message}`);
    const { error: dErr } = await sb.from("issues").delete().in("id", g.slice(1).map((r) => r.id));
    if (dErr) throw new Error(`변형 삭제 실패(${keep.label}): ${dErr.message}`);
  }
  if (apply) console.log(`\n완료 — ${removed}건 병합·삭제.`);
}

main().catch((e) => {
  console.error("[merge-duplicate-issues] 실패:", e instanceof Error ? e.message : e);
  process.exit(1);
});
