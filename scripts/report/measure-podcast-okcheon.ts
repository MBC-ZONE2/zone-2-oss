// ============================================================================
// scripts/report/measure-podcast-okcheon — 「오늘의 충북」 옥천 비중 실측 (#166 검증 게이트)
//
// 최근 N회차(failed 제외)에 대해:
//   · 대본 문단 중 "옥천" 이 든 문단 비율(deliverables/19 와 같은 대리지표)
//   · 옥천 언급 0 회차 수, 헤드라인에 옥천이 든 회차 수
//   · source_refs.articleIds ⨝ articles.source 로 **투입 기사의 매체 비율**(정밀 지표 — 운영 DB 전용)
// 게이트(#166): 배포 2주 뒤 옥천 문단 25%+, 옥천 0회차 0, 헤드라인 옥천 주 2회+.
//
// 실행: pnpm tsx scripts/report/measure-podcast-okcheon.ts [--days=14] [--since=YYYY-MM-DD]
// 필요 env(.env.local 자동 로드): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// ============================================================================

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
    // 셸 env 허용
  }
}

function arg(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
}

interface Row {
  scheduled_for: string;
  title: string;
  headline: string | null;
  script: string | null;
  source_refs: { articleIds?: unknown } | null;
}

async function main(): Promise<void> {
  loadEnv();
  const days = Number(arg("days") ?? 14);
  const kstToday = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  // 기간 = [오늘-(days-1), 오늘] — days 일치. deliverables/19 와 같게 발행(published) 회차만
  const since =
    arg("since") ?? new Date(Date.now() - (days - 1) * 24 * 3600 * 1000 + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const { createServiceClient } = await import("../../lib/supabase/server");
  const sb = createServiceClient();

  const { data, error } = await sb
    .from("podcast_episodes")
    .select("scheduled_for, title, headline, script, source_refs")
    .eq("status", "published")
    .gte("scheduled_for", since)
    .lte("scheduled_for", kstToday)
    .order("scheduled_for", { ascending: true });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Row[];
  if (rows.length === 0) {
    console.log(`${since} 이후 회차 없음`);
    return;
  }

  // 투입 기사 매체 — 전 회차 id 를 모아 한 번에 조회
  const allIds = [...new Set(rows.flatMap((r) => (Array.isArray(r.source_refs?.articleIds) ? r.source_refs!.articleIds : [])))]
    .filter((v): v is string => typeof v === "string");
  const sourceOf = new Map<string, string>();
  for (let i = 0; i < allIds.length; i += 200) {
    const { data: arts, error: aErr } = await sb.from("articles").select("id, source").in("id", allIds.slice(i, i + 200));
    if (aErr) throw new Error(`기사 매체 조회 실패: ${aErr.message}`);
    for (const a of (arts ?? []) as { id: string; source: string }[]) sourceOf.set(a.id, a.source);
  }
  let unresolved = 0; // 삭제된 기사 등 매체를 알 수 없는 id — 분모에서 뺀다

  let paraTotal = 0;
  let paraOk = 0;
  let zeroEpisodes = 0;
  let headlineOk = 0;
  let artTotal = 0;
  let artOk = 0;
  console.log(`회차           옥천문단/전체  투입(옥천/전체)  헤드라인`);
  for (const r of rows) {
    const paras = (r.script ?? "").split(/\n+/).map((p) => p.trim()).filter((p) => p.length > 0);
    const ok = paras.filter((p) => p.includes("옥천")).length;
    paraTotal += paras.length;
    paraOk += ok;
    if (ok === 0) zeroEpisodes += 1;
    const ids = Array.isArray(r.source_refs?.articleIds) ? (r.source_refs!.articleIds as string[]) : [];
    const known = ids.filter((id) => sourceOf.has(id));
    unresolved += ids.length - known.length;
    const okArts = known.filter((id) => sourceOf.get(id) === "okinews").length;
    artTotal += known.length;
    artOk += okArts;
    const hl = (r.headline ?? "").includes("옥천");
    if (hl) headlineOk += 1;
    console.log(
      `${r.scheduled_for}   ${String(ok).padStart(3)}/${String(paras.length).padEnd(4)}      ${String(okArts).padStart(2)}/${String(ids.length).padEnd(3)}        ${hl ? "옥천 ○" : "      –"} ${(r.headline ?? "").slice(0, 34)}`,
    );
  }
  const pct = paraTotal ? Math.round((paraOk / paraTotal) * 1000) / 10 : 0;
  const artPct = artTotal ? Math.round((artOk / artTotal) * 100) : 0;
  const spanDays = Math.round((Date.parse(kstToday) - Date.parse(since)) / 86_400_000) + 1;
  const headlineNeed = Math.ceil((spanDays / 7) * 2); // 달력 기간 기준 "주 2회"
  console.log(`\n${rows.length}회차(${since}~${kstToday}, ${spanDays}일, published): 옥천 문단 ${paraOk}/${paraTotal} (${pct}%) · 옥천 0회차 ${zeroEpisodes} · 헤드라인 옥천 ${headlineOk} · 투입 기사 옥천 ${artOk}/${artTotal} (${artPct}%)${unresolved ? ` · 매체 미확인 id ${unresolved}` : ""}`);
  console.log(`게이트(#166): 문단 25%+ ${pct >= 25 ? "✓" : "✗"} · 0회차 0 ${zeroEpisodes === 0 ? "✓" : "✗"} · 헤드라인 주 2회+(${headlineNeed}건) ${headlineOk >= headlineNeed ? "✓" : "✗"}`);
}

main().catch((e) => {
  console.error("[measure] 실패:", e instanceof Error ? e.message : e);
  process.exit(1);
});
