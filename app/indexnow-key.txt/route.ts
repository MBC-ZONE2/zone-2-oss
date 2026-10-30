// GET /indexnow-key.txt — IndexNow 키 소유 증명 파일(본문 = 키). 키가 없으면 404.
import { indexNowKey } from "@/lib/seo/indexnow";

export const dynamic = "force-dynamic";

export function GET() {
  const key = indexNowKey();
  if (!key) return new Response("not configured", { status: 404 });
  return new Response(key, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=86400" } });
}
