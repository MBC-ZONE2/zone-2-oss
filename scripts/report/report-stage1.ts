// ============================================================================
// scripts/report/report-stage1 — 검증지표 정량 데이터 산출 (터미널판)
//
// docs/02-검증지표.md 의 5대 지표 + 수집 성공률 + 규모 데이터를 뽑는다. 숫자는 전부 DB 실측이며,
// 없는 값은 만들지 않고 "측정 불가"로 표시한다. **관리자 /admin/metrics 와 같은 함수**
// (lib/metrics.buildMetricsReport)를 쓰므로 터미널과 화면 숫자가 어긋나지 않는다(#181).
//
// 실행: pnpm report:stage1 [--period=oct|report2w|reportcum|pilot|30d] [--csv=out.csv]   (기본 oct = 10/1~오늘)
// 연결: service_role 클라이언트(RLS 우회). .env.local 을 직접 로드한다.
// ============================================================================

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { region } from "../../config/region";
import { buildMetricsReport, DEFAULT_PERIOD, isPeriodKey, reportToCsv, VERDICT_LABEL } from "../../lib/metrics";

/** .env.local 로드 (dotenv 미설치 — 상위 환경 우선) */
function loadEnvLocal(): void {
  let raw: string;
  try {
    raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  } catch {
    return;
  }
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvLocal();

function client(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 필요합니다(.env.local).");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

function arg(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
}

async function main(): Promise<void> {
  const periodArg = arg("period") ?? DEFAULT_PERIOD;
  if (!isPeriodKey(periodArg)) throw new Error("--period 는 oct|report2w|reportcum|pilot|30d 중 하나");
  const report = await buildMetricsReport(client(), periodArg);
  const { period } = report;

  console.log(`=== ${region.site.name} 검증지표 (docs/02-검증지표.md) — ${period.label} ${period.since}~${period.until} (${period.days}일) ===\n`);
  for (const i of report.indicators) {
    console.log(`[지표 ${i.no} ${i.title}] 목표 ${i.target}`);
    console.log(`  → ${i.display}  [${VERDICT_LABEL[i.verdict]}]  (${i.range})`);
    for (const b of i.breakdown) console.log(`     ${b.label.padEnd(10)}: ${b.display}`);
    console.log(`     ${i.note}`);
    console.log();
  }

  console.log("[검수 승인율 — 대상별]");
  for (const a of report.approval) {
    const rate = a.rate == null ? "측정 불가" : `${(a.rate * 100).toFixed(1)}%`;
    console.log(`  ${a.target.padEnd(10)} 승인 ${String(a.approved).padStart(4)} · 반려 ${String(a.rejected).padStart(3)} · 확인 ${String(a.confirms).padStart(3)} · 마감공개(제외) ${String(a.autoPublished).padStart(3)} · 운영정리(제외) ${String(a.cleanup).padStart(3)} → ${rate}`);
  }

  console.log("\n[수집·생성 실적]  (구간)");
  for (const v of report.volumes) {
    const p = v.period == null ? "—" : String(v.period);
    console.log(`  ${v.label.padEnd(26)}: ${p.padStart(7)}${v.note ? `   (${v.note})` : ""}`);
  }

  const csvPath = arg("csv");
  if (csvPath) {
    writeFileSync(csvPath, reportToCsv(report), "utf8");
    console.log(`\nCSV 저장: ${csvPath}`);
  }
}

main().catch((error) => {
  console.error("산출 실패:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
