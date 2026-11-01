// ============================================================================
// GET /news-sitemap.xml — Google News 사이트맵 (최근 2일 안에 공개된 크로스뷰·팟캐만, 최대 1,000건)
//
// 규격(developers.google.com/search/docs/crawling-indexing/sitemaps/news-sitemap):
//   <news:publication><news:name>·<news:language>, <news:publication_date>(최초 공개 시각), <news:title>.
//   "지난 2일 안에 만든 기사만", 한 파일 1,000 <news:news> 이하. 발행처 이름은 화면의 발행처명과 같아야 한다 → "ZONE-2".
// 온도 사안·공론장 글은 기사가 아니라 넣지 않는다(일반 sitemap.xml 에만).
// ============================================================================

import { region } from "@/config/region";
import { SITE_NAME, SITE_URL, xmlEscape } from "@/lib/seo/site";
import { getSeoEntries } from "@/lib/seo/urls";

export const dynamic = "force-dynamic";

const TWO_DAYS_MS = 2 * 24 * 3600 * 1000;

export async function GET() {
  const since = Date.now() - TWO_DAYS_MS;
  const entries = (await getSeoEntries())
    .filter((e) => (e.kind === "crossview" || e.kind === "podcast") && Date.parse(e.publishedAt) >= since)
    .slice(0, 1000);

  const items = entries
    .map(
      (e) => `  <url>
    <loc>${xmlEscape(`${SITE_URL}${e.path}`)}</loc>
    <news:news>
      <news:publication>
        <news:name>${xmlEscape(SITE_NAME)}</news:name>
        <news:language>${region.site.lang}</news:language>
      </news:publication>
      <news:publication_date>${new Date(e.publishedAt).toISOString()}</news:publication_date>
      <news:title>${xmlEscape(e.title)}</news:title>
    </news:news>
  </url>`,
    )
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${items}
</urlset>
`;
  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=600, s-maxage=600, stale-while-revalidate=1800",
    },
  });
}
