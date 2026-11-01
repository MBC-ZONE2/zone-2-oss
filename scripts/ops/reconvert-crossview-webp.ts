// ============================================================================
// scripts/ops/reconvert-crossview-webp — 크로스뷰 카드 WebP 를 REQ-006 규격(1080×1350)으로 다시 만든다 (#189 B)
//
// 이전 규칙(가로 1080 상한·확대 없음)으로 저장된 WebP 는 Gemini 4:5 출력 그대로 928×1152 였다.
// 버킷에 보존된 원본 PNG(`{pairId}.png`)를 내려받아 lib/ai/image.convertPngToWebp(이제 1080×1350 cover)로
// 다시 변환해 같은 경로(`{pairId}.webp`)에 덮어쓴다 — card_image_url 은 그대로라 DB 변경이 없다.
// 원본 PNG 가 없으면 기존 WebP 를 원본 삼아 확대한다(품질은 조금 떨어지지만 규격은 맞는다).
//
// 실행(운영 머신, main cwd — .env.local 자동 로드):
//   pnpm tsx scripts/ops/reconvert-crossview-webp.ts            # 미리보기(대상·현재 크기만 출력)
//   pnpm tsx scripts/ops/reconvert-crossview-webp.ts --apply    # 실제 덮어쓰기
// ============================================================================
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { CARD_HEIGHT, CARD_WIDTH, convertPngToWebp } from "../../lib/ai/image";

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

const BUCKET = "crossview";

async function main(): Promise<void> {
  loadEnv();
  const apply = process.argv.includes("--apply");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.");
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  // 페이지네이션 — PostgREST 기본 상한(1,000행)에 걸리지 않게 500씩 끝까지
  const rows: { id: string; card_image_url: string }[] = [];
  for (let from = 0; ; from += 500) {
    const { data: pairs, error } = await supabase
      .from("crossview_pairs")
      .select("id, card_image_url")
      .not("card_image_url", "is", null)
      .like("card_image_url", "%.webp")
      .order("created_at", { ascending: true })
      .range(from, from + 499);
    if (error) throw new Error(error.message);
    const page = (pairs ?? []) as { id: string; card_image_url: string }[];
    rows.push(...page);
    if (page.length < 500) break;
  }
  console.log(`대상 ${rows.length}건 (${apply ? "적용" : "미리보기"}) — 규격 ${CARD_WIDTH}×${CARD_HEIGHT}`);

  let done = 0;
  let skipped = 0;
  let failed = 0;
  for (const r of rows) {
    const webpPath = `${r.id}.webp`;
    try {
      // 원본 PNG 우선, 없으면 기존 WebP 를 원본으로. 기존 WebP 가 없어도 PNG 가 있으면 새로 만든다
      const [png, cur] = await Promise.all([
        supabase.storage.from(BUCKET).download(`${r.id}.png`),
        supabase.storage.from(BUCKET).download(webpPath),
      ]);
      const pngBuf = png.data && !png.error ? Buffer.from(await png.data.arrayBuffer()) : null;
      const curBuf = cur.data && !cur.error ? Buffer.from(await cur.data.arrayBuffer()) : null;
      if (!pngBuf && !curBuf) {
        console.log(`  ${r.id} 원본 PNG·WebP 둘 다 없음 — 건너뜀`);
        skipped++;
        continue;
      }
      const meta = curBuf ? await sharp(curBuf).metadata() : null;
      if (meta && meta.width === CARD_WIDTH && meta.height === CARD_HEIGHT) {
        skipped++;
        continue;
      }
      const src = pngBuf ?? (curBuf as Buffer);
      if (!apply) {
        console.log(`  ${r.id} ${meta ? `${meta.width}×${meta.height}` : "WebP 없음"} → 재변환(원본 ${pngBuf ? "png" : "webp"})`);
        done++;
        continue;
      }
      const out = await convertPngToWebp(src);
      if (!out) throw new Error("변환 실패");
      const up = await supabase.storage.from(BUCKET).upload(webpPath, out, { contentType: "image/webp", upsert: true });
      if (up.error) throw new Error(`업로드 실패: ${up.error.message}`);
      done++;
      if (done % 20 === 0) console.log(`  …${done}건`);
    } catch (e) {
      console.log(`  ${r.id} 실패: ${e instanceof Error ? e.message : String(e)}`);
      failed++;
    }
  }
  console.log(`완료 ${done} · 이미 규격 ${skipped} · 실패 ${failed}`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
