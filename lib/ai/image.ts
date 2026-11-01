import { createServiceClient } from "@/lib/supabase/server";

const GEMINI_MODEL = "gemini-3-pro-image";
const GEMINI_ENDPOINT =
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const BUCKET = "crossview";

interface GeminiImageResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        inlineData?: {
          data?: string;
          mimeType?: string;
        };
      }>;
    };
  }>;
}

function buildPrompt(input: {
  title: string;
  readingPoint?: string | null;
}): string {
  const readingPoint = input.readingPoint?.trim();

  // 디에디트풍 카드뉴스 표지: 풀블리드 시네마틱 실사 히어로 + 상단 오버레이 여백.
  return [
    "Create a cinematic, photorealistic editorial cover photograph for a Korean local-news 'card news' about the topic below.",
    "Style: documentary photojournalism, shot on 35mm film, soft natural light, shallow depth of field, muted cinematic color grade with a subtle warm (terracotta) undertone.",
    "The scene should evoke the news topic through a real place/situation in rural Chungbuk / Okcheon, Korea — not a literal reenactment.",
    "CRITICAL COMPOSITION: keep the TOP 40% of the frame relatively DARK and uncluttered (sky, wall, shadow, or soft bokeh) so a white headline can be overlaid legibly. Place the focal subject in the lower half.",
    "Do NOT include any text, letters, numbers, logos, or watermarks in the image.",
    "Do NOT depict any identifiable real person's face — shoot from behind, in profile, or with soft focus so no face is recognizable.",
    "Vertical 4:5 aspect ratio. Dignified, respectful public-interest tone for readers in their 40s-60s.",
    "The title and reading point below are source material for the subject only; never render those words in the image.",
    `<제목>${input.title.trim()}</제목>`,
    readingPoint ? `<리딩포인트>${readingPoint}</리딩포인트>` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

async function requestImage(prompt: string, apiKey: string): Promise<Buffer> {
  const response = await fetch(GEMINI_ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ["IMAGE"],
        // 디에디트풍 세로 카드 — 4:5 풀블리드
        imageConfig: { aspectRatio: "4:5" },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Gemini 이미지 생성 요청 실패 (${response.status} ${response.statusText})`,
    );
  }

  const payload = (await response.json()) as GeminiImageResponse;
  const image = payload.candidates?.[0]?.content?.parts?.find(
    (part) => part.inlineData?.data,
  )?.inlineData;

  if (!image?.data) {
    throw new Error("Gemini 응답에 생성된 이미지 데이터가 없습니다.");
  }

  return Buffer.from(image.data, "base64");
}

/** Gemini로 크로스뷰 카드뉴스용 PNG 배경 일러스트를 생성한다. */
export async function generateCrossviewIllustration(input: {
  title: string;
  readingPoint?: string | null;
}): Promise<Buffer> {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_GENERATIVE_AI_API_KEY 환경변수가 필요합니다.");
  }

  const prompt = buildPrompt(input);
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await requestImage(prompt, apiKey);
    } catch (error) {
      lastError = error;
    }
  }

  const message = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`Gemini 이미지 생성 실패(1회 재시도 포함): ${message}`);
}

/** WebP 저장 규격 — REQ-006 카드 규격 1080×1350(4:5) 에 맞춰 항상 이 크기로 맞춘다(cover 크롭, 작으면 확대).
 *  Gemini 4:5 출력은 928×1152 라 이전 "확대 없음" 규칙으로는 그대로 저장돼 규격 미달이었다(#189 B, 2026-10-22).
 *  품질 80. 4:5 카드 기준 원본 PNG 0.6~0.8MB → 약 80~150KB. */
export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1350;
const WEBP_QUALITY = 80;

/**
 * PNG 버퍼를 sharp 로 WebP 로 변환한다. sharp 는 동적 import — 네이티브 모듈 로드에
 * 실패하는 환경(예: 바이너리 미설치)에서는 null 을 돌려주고 호출부가 PNG 로 폴백한다.
 */
export async function convertPngToWebp(png: Buffer): Promise<Buffer | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment -- 설치 여부와 무관하게 통과해야 하므로 ts-ignore 사용
    // @ts-ignore -- sharp 는 선택 의존성: 미설치 워크트리에서도 타입체크가 통과해야 한다(런타임은 catch 로 폴백)
    const sharp = (await import("sharp")).default;
    return await sharp(png)
      .resize({ width: CARD_WIDTH, height: CARD_HEIGHT, fit: "cover", position: "attention" })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();
  } catch (error) {
    console.error(
      "[crossview-image] sharp WebP 변환 실패 — PNG 그대로 사용:",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

/** 버킷에 한 객체를 upsert 하고 public URL 을 돌려준다. */
async function uploadObject(
  supabase: ReturnType<typeof createServiceClient>,
  objectPath: string,
  body: Buffer,
  contentType: string,
): Promise<string> {
  const { error } = await supabase.storage.from(BUCKET).upload(objectPath, body, {
    contentType,
    upsert: true,
  });
  if (error) {
    throw new Error(`크로스뷰 이미지 업로드 실패(${objectPath}): ${error.message}`);
  }
  return supabase.storage.from(BUCKET).getPublicUrl(objectPath).data.publicUrl;
}

/**
 * 생성한 PNG 를 공개 crossview 버킷에 올리고 화면에 쓸 public URL 을 반환한다.
 * - `{pairId}.png`  원본 보존(아카이브·재변환용) — 항상 올린다.
 * - `{pairId}.webp` 1080×1350 q80 — 변환에 성공하면 이 URL 을 돌려준다(card_image_url).
 * 변환 실패(sharp 로드 불가 등) 시에는 PNG URL 로 폴백한다.
 * 카드 다운로드 API(/api/crossview/[id]/card/[index])는 card_image_url 을 쓰지 않고
 * 슬라이드를 즉석 렌더하므로 WebP 전환의 영향이 없다.
 */
export async function uploadCrossviewImage(
  pairId: string,
  png: Buffer,
): Promise<string> {
  const supabase = createServiceClient();
  const pngUrl = await uploadObject(supabase, `${pairId}.png`, png, "image/png");

  const webp = await convertPngToWebp(png);
  if (!webp) return pngUrl;
  return uploadObject(supabase, `${pairId}.webp`, webp, "image/webp");
}

interface BackfillPairRow {
  id: string;
  reading_point: string | null;
  card_data: { headline?: string } | null;
  macro: { title: string } | Array<{ title: string }> | null;
}

/**
 * 이미지가 없는(card_image_url is null) 승인 크로스뷰 페어의 카드 이미지를 생성한다.
 * 매칭으로 새로 승인된 페어를 크론이 주기적으로 자동 채우는 데 쓴다.
 * @returns {generated, failed, targeted}
 */
export async function backfillCrossviewImages(
  limit = 20,
): Promise<{ generated: number; failed: number; targeted: number }> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("crossview_pairs")
    .select(
      "id, reading_point, card_data, macro:articles!crossview_pairs_article_macro_fkey(title)",
    )
    .eq("status", "approved")
    .is("card_image_url", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`크로스뷰 페어 조회 실패: ${error.message}`);

  const pairs = (data ?? []) as BackfillPairRow[];
  let generated = 0;
  let failed = 0;
  for (const pair of pairs) {
    try {
      const macro = Array.isArray(pair.macro) ? pair.macro[0] : pair.macro;
      const title = macro?.title?.trim() || pair.card_data?.headline?.trim();
      if (!title) throw new Error("제목 없음");
      const png = await generateCrossviewIllustration({
        title,
        readingPoint: pair.reading_point,
      });
      const url = await uploadCrossviewImage(pair.id, png);
      const { error: upErr } = await supabase
        .from("crossview_pairs")
        .update({ card_image_url: url })
        .eq("id", pair.id);
      if (upErr) throw new Error(upErr.message);
      generated += 1;
    } catch (e) {
      failed += 1;
      console.error(`[crossview-image] ${pair.id} 실패:`, e instanceof Error ? e.message : e);
    }
  }
  return { generated, failed, targeted: pairs.length };
}
