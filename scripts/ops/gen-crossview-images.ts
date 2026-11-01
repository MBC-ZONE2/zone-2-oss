// 승인된 크로스뷰 중 이미지가 없는 최신 페어의 카드뉴스 배경을 생성한다.
// 실행: pnpm tsx scripts/ops/gen-crossview-images.ts [limit]

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

interface PairRow {
  id: string;
  reading_point: string | null;
  card_data: unknown;
  macro: { title: string } | Array<{ title: string }> | null;
}

function loadEnv(): void {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separator = trimmed.indexOf("=");
      if (separator === -1) continue;

      const key = trimmed.slice(0, separator).trim();
      if (process.env[key] === undefined) {
        process.env[key] = trimmed.slice(separator + 1).trim();
      }
    }
  } catch {
    // 환경변수가 셸에 이미 설정된 실행 환경도 허용한다.
  }
}

function parseLimit(value: string | undefined): number {
  if (value === undefined) return 3;
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error("limit은 1 이상의 정수여야 합니다.");
  }
  return limit;
}

function headline(cardData: unknown): string | null {
  if (!cardData || typeof cardData !== "object" || Array.isArray(cardData)) {
    return null;
  }
  const value = (cardData as Record<string, unknown>).headline;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function pairTitle(pair: PairRow): string | null {
  const macro = Array.isArray(pair.macro) ? pair.macro[0] : pair.macro;
  return macro?.title?.trim() || headline(pair.card_data);
}

async function main(): Promise<void> {
  loadEnv();
  // --all: 이미지 유무와 무관하게 승인 페어 전체를 재생성(스토리지 upsert로 교체).
  const args = process.argv.slice(2);
  const all = args.includes("--all");
  const limit = parseLimit(args.find((a) => !a.startsWith("--")));
  const { createServiceClient } = await import("../../lib/supabase/server");
  const { generateCrossviewIllustration, uploadCrossviewImage } = await import(
    "../../lib/ai/image"
  );
  const supabase = createServiceClient();

  let query = supabase
    .from("crossview_pairs")
    .select(
      "id, reading_point, card_data, macro:articles!crossview_pairs_article_macro_fkey(title)",
    )
    .eq("status", "approved");
  if (!all) query = query.is("card_image_url", null);
  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`크로스뷰 페어 조회 실패: ${error.message}`);
  }

  const pairs = (data ?? []) as PairRow[];
  let generated = 0;
  console.log(`이미지 생성 대상 ${pairs.length}건 (limit ${limit})`);

  for (const [index, pair] of pairs.entries()) {
    try {
      const title = pairTitle(pair);
      if (!title) throw new Error("기사 제목과 card_data.headline이 모두 없습니다.");

      console.log(`[${index + 1}/${pairs.length}] ${pair.id} 생성 시작`);
      const png = await generateCrossviewIllustration({
        title,
        readingPoint: pair.reading_point,
      });
      const publicUrl = await uploadCrossviewImage(pair.id, png);
      const { error: updateError } = await supabase
        .from("crossview_pairs")
        .update({ card_image_url: publicUrl })
        .eq("id", pair.id);

      if (updateError) {
        throw new Error(`card_image_url 저장 실패: ${updateError.message}`);
      }

      generated += 1;
      console.log(`[${index + 1}/${pairs.length}] ${pair.id} 생성 성공`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[${index + 1}/${pairs.length}] ${pair.id} 생성 실패: ${message}`);
    }
  }

  console.log(`완료: 대상 ${pairs.length}건 중 ${generated}건 생성`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`크로스뷰 이미지 생성 작업 실패: ${message}`);
  process.exitCode = 1;
});
