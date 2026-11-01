// ============================================================================
// scripts/ops/reembed-local — 기존 기사에 로컬 임베딩 재적재
//
// AI_MOCK 시절 난수 임베딩이 들어간 기사를, 의미 있는 로컬 임베딩(문자 n-gram)
// 으로 다시 채운다. 실키가 오면 실제 임베딩으로 재적재하면 된다.
//
// 실행: pnpm tsx scripts/ops/reembed-local.ts [--all]
//   기본: embedding 이 NULL 인 것만. --all: 전체 재적재.
// ============================================================================

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { localEmbedding } from "../../lib/ai/local-embed";

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
    /* ignore */
  }
}

async function main(): Promise<void> {
  loadEnv();
  const all = process.argv.includes("--all");

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  let query = supabase.from("articles").select("id, title, body");
  if (!all) query = query.is("embedding", null);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  console.log(`재임베딩 대상: ${rows.length}건${all ? " (전체)" : " (NULL만)"}`);

  let done = 0;
  for (const row of rows as Array<{ id: string; title: string; body: string | null }>) {
    const vec = localEmbedding(`${row.title}\n${row.body ?? ""}`);
    const { error: upErr } = await supabase
      .from("articles")
      .update({ embedding: vec })
      .eq("id", row.id);
    if (upErr) {
      console.error(`  실패 ${row.id}: ${upErr.message}`);
      continue;
    }
    done += 1;
    if (done % 50 === 0) console.log(`  ${done}/${rows.length}`);
  }

  console.log(`완료: ${done}/${rows.length} 재임베딩`);
}

main().catch((e) => {
  console.error("재임베딩 실패:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
