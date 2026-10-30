// ============================================================================
// POST /api/forum/image — 공론장 글 사진 1장 업로드 (대표 지시 2026-10-19)
//
// multipart/form-data { file } → 이미지 MIME·5MB 검사 → sharp 로 긴 변 1600px·WebP q80·메타데이터 제거
// → 'forum' 버킷 /YYYY/MM/<uuid>.webp (service_role) → { url }. 글 작성(POST /api/forum)은 이 버킷의
// 공개 URL 만 image_url 로 받는다(임의 URL 주입 방지). 같은 IP 분당 6장 제한(메모리, IP 미저장).
// ============================================================================

import type { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { clientIpFrom, errors, ok } from "@/lib/forum";
import { FORUM_IMAGE_MAX_BYTES, forumImagePublicPrefix } from "@/lib/forum/image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
/** sharp 가 읽은 실제 포맷(브라우저 MIME 과 별개) */
const REAL_FORMATS = new Set(["jpeg", "png", "webp", "heif", "avif"]);
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 6;
const buckets = new Map<string, { start: number; n: number }>();

function allow(ip: string | null): boolean {
  const key = ip ?? "unknown";
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now - b.start >= RATE_WINDOW_MS) {
    buckets.set(key, { start: now, n: 1 });
    // 만료된 버킷 정리(메모리 상한) — 단일 인스턴스 launchd 서버 전제
    if (buckets.size > 2000) for (const [k, v] of buckets) if (now - v.start >= RATE_WINDOW_MS) buckets.delete(k);
    return true;
  }
  b.n += 1;
  return b.n <= RATE_MAX;
}

export async function POST(request: NextRequest) {
  if (!allow(clientIpFrom(request.headers))) return errors.rateLimited("사진은 1분에 6장까지 올릴 수 있습니다");
  // 본문을 메모리에 올리기 전에 선언 길이로 먼저 자른다(폼 오버헤드 여유 포함)
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > FORUM_IMAGE_MAX_BYTES + 64 * 1024) return errors.validation("사진은 5MB 이하만 올릴 수 있습니다");

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return errors.validation("사진 파일을 찾을 수 없습니다");
  }
  const file = form.get("file");
  if (!(file instanceof Blob)) return errors.validation("사진 파일을 선택해 주세요");
  if (file.size > FORUM_IMAGE_MAX_BYTES) return errors.validation("사진은 5MB 이하만 올릴 수 있습니다");
  if (!ALLOWED.has(file.type)) return errors.validation("JPG·PNG·WebP·HEIC 사진만 올릴 수 있습니다");

  try {
    const sharp = (await import("sharp")).default;
    const input = Buffer.from(await file.arrayBuffer());
    // 브라우저가 붙인 MIME 이 아니라 실제 바이트의 포맷을 본다(image/png 로 위장한 SVG 등 차단). 픽셀 상한 4천만
    const probe = sharp(input, { failOn: "none", limitInputPixels: 40_000_000 });
    const meta = await probe.metadata();
    if (!meta.format || !REAL_FORMATS.has(meta.format)) {
      return errors.validation("JPG·PNG·WebP·HEIC 사진만 올릴 수 있습니다");
    }
    const out = await sharp(input, { failOn: "none", limitInputPixels: 40_000_000 })
      .rotate() // EXIF 방향 반영 뒤 메타데이터는 버린다(위치 정보 등)
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();

    const now = new Date();
    const path = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${crypto.randomUUID()}.webp`;
    const supabase = createServiceClient();
    const { error } = await supabase.storage.from("forum").upload(path, out, { contentType: "image/webp", cacheControl: "31536000", upsert: false });
    if (error) {
      console.error("[/api/forum/image] 업로드 실패:", error.message);
      return errors.internal();
    }
    const url = `${forumImagePublicPrefix()}${path}`;
    return ok({ url, bytes: out.length }, 201);
  } catch (e) {
    console.error("[/api/forum/image] 처리 실패:", e instanceof Error ? e.message : e);
    return errors.validation("사진을 처리하지 못했습니다. 다른 사진으로 시도해 주세요");
  }
}
