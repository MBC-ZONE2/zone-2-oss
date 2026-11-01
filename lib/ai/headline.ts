// ============================================================================
// lib/ai/headline — 크로스뷰 카드뉴스 히어로용 짧은 대조 헤드라인 생성(codex)
//
// readingPoint(분석 문장)는 히어로에 무거워, 광역/기초 요약에서 "광역은 A를,
// 기초는 B를 말한다" 식의 2줄 이내 압축 대조 헤드라인을 만든다.
// 사실 왜곡 금지 — 요약에 있는 내용만 압축한다.
// ============================================================================

import { z } from "zod";
import { generateJsonViaCli, isLocalCliMode } from "./local-cli";
import { createServiceClient } from "@/lib/supabase/server";

const HeadlineSchema = z.object({
  headline: z.string().min(6).max(60),
});

const SYSTEM =
  "너는 한국 지역 저널리즘의 헤드라인 에디터다. 광역(도 단위)과 기초(시·군 단위) 두 매체가 " +
  "같은 사안을 어떻게 다르게 조명했는지를 한 문장으로 압축한다. 규칙: (1) 30자 이내 권장, 최대 40자. " +
  "(2) 가능하면 '광역은 …, 기초는 …' 대조 구조. (3) 요약에 없는 사실을 지어내지 말 것. " +
  "(4) 마침표·따옴표 없이 헤드라인만. (5) 과장·낚시 금지, 담백하게.";

/** 광역/기초 요약 → 짧은 대조 헤드라인. codex 미가동/실패 시 null. */
export async function generateContrastHeadline(input: {
  title: string;
  summaryMacro: string | null;
  summaryMicro: string | null;
}): Promise<string | null> {
  if (!isLocalCliMode()) return null;
  const prompt = [
    `사안: ${input.title.trim()}`,
    `광역 요약: ${input.summaryMacro?.trim() || "(없음)"}`,
    `기초 요약: ${input.summaryMicro?.trim() || "(없음)"}`,
    "",
    "위 두 시선을 압축한 대조 헤드라인 한 줄을 만들어라.",
  ].join("\n");

  const result = await generateJsonViaCli(HeadlineSchema, {
    system: SYSTEM,
    prompt,
    format: '{"headline": "광역은 …, 기초는 …"}',
    label: "crossview-headline",
  });
  return result?.headline?.trim() || null;
}

interface HeadlinePairRow {
  id: string;
  reading_point: string | null;
  summary_macro: string | null;
  summary_micro: string | null;
  card_data: { headline?: string } | null;
  macro: { title: string } | Array<{ title: string }> | null;
}

/**
 * card_headline이 비어 있는 승인 페어에 대조 헤드라인을 생성해 채운다.
 * @returns {generated, failed, targeted}
 */
export async function backfillCrossviewHeadlines(
  limit = 20,
): Promise<{ generated: number; failed: number; targeted: number }> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("crossview_pairs")
    .select(
      "id, reading_point, summary_macro, summary_micro, card_data, macro:articles!crossview_pairs_article_macro_fkey(title)",
    )
    .eq("status", "approved")
    .is("card_headline", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`페어 조회 실패: ${error.message}`);

  const pairs = (data ?? []) as HeadlinePairRow[];
  let generated = 0;
  let failed = 0;
  for (const pair of pairs) {
    try {
      const macro = Array.isArray(pair.macro) ? pair.macro[0] : pair.macro;
      const title =
        macro?.title?.trim() || pair.card_data?.headline?.trim() || pair.reading_point?.trim() || "";
      const headline = await generateContrastHeadline({
        title,
        summaryMacro: pair.summary_macro,
        summaryMicro: pair.summary_micro,
      });
      if (!headline) throw new Error("헤드라인 생성 실패(codex null)");
      const { error: upErr } = await supabase
        .from("crossview_pairs")
        .update({ card_headline: headline })
        .eq("id", pair.id);
      if (upErr) throw new Error(upErr.message);
      generated += 1;
    } catch (e) {
      failed += 1;
      console.error(`[headline] ${pair.id} 실패:`, e instanceof Error ? e.message : e);
    }
  }
  return { generated, failed, targeted: pairs.length };
}
