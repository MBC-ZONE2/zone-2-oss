// ============================================================================
// scripts/report/eval-matching — 크로스뷰 매칭 정확도 검증 (Precision@5)
//
// docs/02-검증지표.md #1: 크로스뷰 매칭 Precision@5 ≥ 70%.
//   수동 태깅 정답셋(matching_eval) 대비, 매칭 엔진(crossview_pairs)이 만든
//   각 광역(macro) 기사별 상위 5건의 일치율을 측정한다.
//
// 측정 방법:
//   1) matching_eval 정답셋이 비어 있으면 데모 기준 정답 페어를 시드(idempotent).
//      - 같은 주제 macro↔micro(bus↔bus, farm↔farm, school↔school)=is_correct true
//      - 교차오답 일부(bus↔farm 등)=is_correct false
//   2) macro 기사별 crossview_pairs 상위 5건(match_score desc)을 정답셋과 대조.
//      Precision@5 = (상위5 중 정답으로 태깅된 페어 수) / min(5, 예측 페어 수)
//   3) 정답셋이 있는 macro 기사들의 Precision@5 평균을 산출 → 목표(≥0.7) PASS/FAIL.
//
// 실행: pnpm eval:matching  (== pnpm tsx scripts/report/eval-matching.ts)
// 연결: @supabase/supabase-js service client (RLS 우회). .env.local 직접 로드.
// 측정 핵심은 lib/metrics/matching 에 있다(관리자 화면과 공용). AI_MOCK=1 환경에서도 측정 로직은 동작.
// ============================================================================

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { evaluatePrecision, TARGET_PRECISION, type EvalReport } from "../../lib/metrics/matching";

// ---------------------------------------------------------------------------
// 0) .env.local 로드 (dotenv 미설치 — 의존성 없이 직접 파싱)
//    이미 process.env 에 있는 값은 덮어쓰지 않는다(상위 환경 우선).
// ---------------------------------------------------------------------------
function loadEnvLocal(): void {
  const path = resolve(process.cwd(), ".env.local");
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    // .env.local 이 없으면 process.env 만 사용한다.
    return;
  }

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    // 양끝 따옴표 제거
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

// ---------------------------------------------------------------------------
// 1) service client 생성 (RLS 우회 — matching_eval/crossview_pairs 접근)
// ---------------------------------------------------------------------------
function createServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 필요합니다 (.env.local 확인).",
    );
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ---------------------------------------------------------------------------
// 타입 (이 스크립트 내부 전용 — 공유 타입은 수정하지 않는다)
// ---------------------------------------------------------------------------
interface ArticleLite {
  id: string;
  source: "mbc_cb" | "okinews";
  external_id: string | null;
}

/** matching_eval 시드 행(스크립트 내부 전용) */
interface EvalRow {
  article_macro: string | null;
  article_micro: string | null;
  is_correct: boolean;
}


// ---------------------------------------------------------------------------
// 2) 정답셋 시드 (idempotent) — 데모 기사 기준
//    데모 external_id 규칙: demo-mbc-<topic>(광역), demo-oki-<topic>(기초)
//    같은 topic → 정답(true), 다른 topic 교차 → 오답(false) 일부.
// ---------------------------------------------------------------------------

/** 데모 기사 external_id 에서 topic(bus/farm/school) 추출 */
function topicOf(externalId: string | null): string | null {
  if (!externalId) return null;
  const m = externalId.match(/^demo-(?:mbc|oki)-(.+)$/);
  return m ? m[1] : null;
}

/**
 * 정답셋이 비어 있으면 데모 기준 페어를 시드한다.
 * @returns 시드한 행 수 (이미 있으면 0)
 */
async function seedEvalIfEmpty(supabase: SupabaseClient): Promise<number> {
  const { count, error: countError } = await supabase
    .from("matching_eval")
    .select("*", { count: "exact", head: true });

  if (countError) {
    throw new Error(`matching_eval 카운트 실패: ${countError.message}`);
  }
  if ((count ?? 0) > 0) {
    console.log(`[seed] matching_eval 이미 ${count}건 존재 — 시드 생략.`);
    return 0;
  }

  // 데모 기사 로드 (광역/기초)
  const { data: articleData, error: articleError } = await supabase
    .from("articles")
    .select("id, source, external_id");
  if (articleError) {
    throw new Error(`articles 조회 실패: ${articleError.message}`);
  }
  const articles = (articleData ?? []) as ArticleLite[];

  const macros = articles.filter((a) => a.source === "mbc_cb");
  const micros = articles.filter((a) => a.source === "okinews");

  if (macros.length === 0 || micros.length === 0) {
    console.warn(
      "[seed] 광역/기초 기사가 없어 정답셋을 시드할 수 없습니다. (데모 데이터 확인)",
    );
    return 0;
  }

  // macro × micro 전수 조합으로 same-topic=true, cross-topic=false 라벨 생성.
  // 교차오답이 과도하지 않게, macro 당 오답은 최대 2건으로 제한한다.
  const rows: EvalRow[] = [];
  for (const macro of macros) {
    const macroTopic = topicOf(macro.external_id);
    let falseCount = 0;
    for (const micro of micros) {
      const microTopic = topicOf(micro.external_id);
      const isSame =
        macroTopic !== null &&
        microTopic !== null &&
        macroTopic === microTopic;

      if (isSame) {
        rows.push({
          article_macro: macro.id,
          article_micro: micro.id,
          is_correct: true,
        });
      } else if (falseCount < 2) {
        // 교차오답 일부만 명시적으로 false 태깅
        rows.push({
          article_macro: macro.id,
          article_micro: micro.id,
          is_correct: false,
        });
        falseCount += 1;
      }
    }
  }

  if (rows.length === 0) {
    console.warn("[seed] 시드할 페어를 만들지 못했습니다.");
    return 0;
  }

  const { error: insertError } = await supabase
    .from("matching_eval")
    .insert(rows);
  if (insertError) {
    throw new Error(`matching_eval 시드 실패: ${insertError.message}`);
  }

  const correct = rows.filter((r) => r.is_correct).length;
  console.log(
    `[seed] matching_eval ${rows.length}건 시드 (정답 ${correct} / 오답 ${rows.length - correct}).`,
  );
  return rows.length;
}

// ---------------------------------------------------------------------------
// 3) Precision@5 계산 — lib/metrics/matching.evaluatePrecision (관리자 /admin/metrics 와 같은 함수, #181)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 4) 리포트 출력
// ---------------------------------------------------------------------------
function printReport(report: EvalReport): void {
  console.log("\n=== 크로스뷰 매칭 Precision@5 ===");
  if (report.evaluatedMacros === 0) {
    console.log(
      "평가할 macro 기사가 없습니다. (matching_eval 정답셋/데모 데이터 확인)",
    );
    return;
  }

  console.log("\n[macro별 Precision@5]");
  for (const m of report.perMacro) {
    const pct = (m.precision * 100).toFixed(1).padStart(5);
    console.log(
      `  ${m.label.padEnd(22)}  P@5=${pct}%  (정답 ${m.hits}/${m.predicted}건 예측)`,
    );
  }

  const meanPct = (report.meanPrecision * 100).toFixed(1);
  const targetPct = (TARGET_PRECISION * 100).toFixed(0);
  console.log(
    `\n평균 Precision@5: ${meanPct}%  (대상 macro ${report.evaluatedMacros}건)`,
  );
  console.log(`목표: ≥ ${targetPct}%`);
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  loadEnvLocal();
  const supabase = createServiceClient();

  await seedEvalIfEmpty(supabase);
  const report = await evaluatePrecision(supabase);
  printReport(report);

  if (report.evaluatedMacros === 0) {
    // 측정 불가 — 비정상 종료로 표시.
    console.log("\nRESULT: FAIL (측정 대상 없음)");
    process.exitCode = 1;
    return;
  }

  const pass = report.meanPrecision >= TARGET_PRECISION;
  console.log(`\nRESULT: ${pass ? "PASS ✅" : "FAIL ❌"}`);
  process.exitCode = pass ? 0 : 1;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error("[eval-matching] 실행 실패:", message);
  process.exitCode = 1;
});
