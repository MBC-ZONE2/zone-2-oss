// ============================================================================
// GET /feed.xml — RSS 2.0 (최신 크로스뷰 + 팟캐 50건)
//
// 용도: 네이버 서치어드바이저 "RSS 제출"(사이트맵과 별도로 갱신 신호) · 뉴스 리더 · 생성형 검색의 최신성 신호.
// 팟캐 항목은 enclosure 를 달지 않는다 — RSS 2.0 은 length 에 실제 바이트 수를 요구하는데 스트림 길이를 모른다(codex 리뷰). 회차 페이지 링크로 충분.
// ============================================================================

import { region } from "@/config/region";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL, xmlEscape } from "@/lib/seo/site";
import { getSeoEntries } from "@/lib/seo/urls";

export const dynamic = "force-dynamic";

export async function GET() {
  const entries = (await getSeoEntries())
    .filter((e) => e.kind === "crossview" || e.kind === "podcast")
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
    .slice(0, 50);
  const lastBuild = entries[0] ? new Date(entries[0].publishedAt) : new Date();

  const items = entries
    .map((e) => {
      const link = `${SITE_URL}${e.path}`;
      const category = e.kind === "crossview" ? "크로스뷰" : `${region.podcast.seriesName}(팟캐스트)`;
      return `    <item>
      <title>${xmlEscape(e.title)}</title>
      <link>${xmlEscape(link)}</link>
      <guid isPermaLink="true">${xmlEscape(link)}</guid>
      <pubDate>${new Date(e.publishedAt).toUTCString()}</pubDate>
      <category>${xmlEscape(category)}</category>
      <description>${xmlEscape(e.description?.trim() || e.title)}</description>
    </item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${xmlEscape(`${SITE_NAME} — 크로스뷰 · ${region.podcast.seriesName}`)}</title>
    <link>${SITE_URL}/</link>
    <atom:link href="${SITE_URL}/feed.xml" rel="self" type="application/rss+xml"/>
    <description>${xmlEscape(SITE_DESCRIPTION)}</description>
    <language>${region.site.lang}</language>
    <lastBuildDate>${lastBuild.toUTCString()}</lastBuildDate>
    <ttl>30</ttl>
    <image>
      <url>${SITE_URL}/icon-512.png</url>
      <title>${xmlEscape(SITE_NAME)}</title>
      <link>${SITE_URL}/</link>
    </image>
${items}
  </channel>
</rss>
`;
  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=600, s-maxage=600, stale-while-revalidate=1800",
    },
  });
}
