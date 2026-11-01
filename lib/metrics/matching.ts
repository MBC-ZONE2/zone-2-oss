// ============================================================================
// lib/metrics/matching — 크로스뷰 매칭 Precision@5 (검증지표 ①)
//
// scripts/report/eval-matching.ts 의 측정 핵심을 옮겨 왔다 — 스크립트와 /admin/metrics 가
// 같은 함수를 써서 숫자가 어긋나지 않게 한다(#181). 정답셋 시드·출력은 스크립트에 남는다.
//   Precision@5 = (macro 기사의 상위 5 예측 중 정답 태깅 수) / min(5, 예측 수)
//   평가 대상 = matching_eval 에 등장하는 macro 기사. 예측 0건이면 0.
//   status='rejected' 는 검수자가 거른 true-negative 라 예측에서 제외한다.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";

export const TARGET_PRECISION = 0.7; // docs/02-검증지표.md #1
export const TOP_K = 5;

interface EvalRow {
  article_macro: string | null;
  article_micro: string | null;
  is_correct: boolean;
}
interface PairRow {
  article_macro: string | null;
  article_micro: string | null;
  match_score: number | null;
}

export interface MacroPrecision {
  articleMacro: string;
  label: string;
  predicted: number;
  hits: number;
  precision: number;
}

export interface EvalReport {
  perMacro: MacroPrecision[];
  meanPrecision: number;
  evaluatedMacros: number;
  /** 정답셋 행 수 */
  goldsetRows: number;
}

function pairKey(macro: string, micro: string): string {
  return `${macro}::${micro}`;
}

export async function evaluatePrecision(supabase: SupabaseClient): Promise<EvalReport> {
  const { data: evalData, error: evalError } = await supabase
    .from("matching_eval")
    .select("article_macro, article_micro, is_correct");
  if (evalError) throw new Error(`matching_eval 조회 실패: ${evalError.message}`);
  const evalRows = (evalData ?? []) as EvalRow[];

  const correctKeys = new Set<string>();
  const macroIds = new Set<string>();
  for (const row of evalRows) {
    if (!row.article_macro || !row.article_micro) continue;
    macroIds.add(row.article_macro);
    if (row.is_correct) correctKeys.add(pairKey(row.article_macro, row.article_micro));
  }
  if (macroIds.size === 0) {
    return { perMacro: [], meanPrecision: 0, evaluatedMacros: 0, goldsetRows: evalRows.length };
  }

  const { data: pairData, error: pairError } = await supabase
    .from("crossview_pairs")
    .select("article_macro, article_micro, match_score")
    .in("article_macro", Array.from(macroIds))
    .neq("status", "rejected")
    .order("match_score", { ascending: false, nullsFirst: false });
  if (pairError) throw new Error(`crossview_pairs 조회 실패: ${pairError.message}`);

  const predictedByMacro = new Map<string, PairRow[]>();
  for (const pair of (pairData ?? []) as PairRow[]) {
    if (!pair.article_macro) continue;
    const list = predictedByMacro.get(pair.article_macro) ?? [];
    list.push(pair);
    predictedByMacro.set(pair.article_macro, list);
  }

  const { data: labelData } = await supabase
    .from("articles")
    .select("id, external_id")
    .in("id", Array.from(macroIds));
  const labelById = new Map<string, string>();
  for (const a of (labelData ?? []) as { id: string; external_id: string | null }[]) {
    labelById.set(a.id, a.external_id ?? a.id);
  }

  const perMacro: MacroPrecision[] = [];
  for (const macroId of macroIds) {
    const top = (predictedByMacro.get(macroId) ?? []).slice(0, TOP_K);
    const predicted = top.length;
    const hits = top.filter((p) => p.article_micro !== null && correctKeys.has(pairKey(macroId, p.article_micro))).length;
    perMacro.push({
      articleMacro: macroId,
      label: labelById.get(macroId) ?? macroId,
      predicted,
      hits,
      precision: predicted === 0 ? 0 : hits / predicted,
    });
  }
  perMacro.sort((a, b) => a.label.localeCompare(b.label));
  const meanPrecision = perMacro.reduce((s, m) => s + m.precision, 0) / perMacro.length;
  return { perMacro, meanPrecision, evaluatedMacros: perMacro.length, goldsetRows: evalRows.length };
}
