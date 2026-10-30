import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo/site";
import { getSeoEntries } from "@/lib/seo/urls";

// /sitemap.xml — 정적 화면 + 공개된 크로스뷰·팟캐·온도 사안·공론장 글(2026-10-26 대표 지시: 검색 노출).
// 목록은 lib/seo/urls 가 10분 캐시로 읽는다. 요청 시점에 만든다(빌드·CI 에서 DB 를 치지 않게 force-dynamic).
export const dynamic = "force-dynamic";

const STATIC: { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }[] = [
  { path: "/", priority: 1, changeFrequency: "hourly" },
  { path: "/crossview", priority: 0.9, changeFrequency: "hourly" },
  { path: "/temperature", priority: 0.8, changeFrequency: "hourly" },
  { path: "/podcast", priority: 0.8, changeFrequency: "daily" },
  { path: "/forum", priority: 0.7, changeFrequency: "hourly" },
  { path: "/notices", priority: 0.6, changeFrequency: "daily" },
  { path: "/about", priority: 0.3, changeFrequency: "monthly" },
  { path: "/privacy", priority: 0.2, changeFrequency: "yearly" },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries = await getSeoEntries();
  const dynamicUrls: MetadataRoute.Sitemap = entries.map((e) => ({
    url: `${SITE_URL}${e.path}`,
    lastModified: new Date(e.updatedAt ?? e.publishedAt),
    changeFrequency: e.kind === "issue" ? "hourly" : e.kind === "forum" ? "daily" : "weekly",
    priority: e.kind === "crossview" ? 0.8 : e.kind === "podcast" ? 0.7 : 0.5,
  }));
  return [
    // 정적 화면은 lastmod 를 적지 않는다 — 요청 시각을 적으면 "늘 바뀐 페이지"가 돼 크롤러의 변경 판단을 망친다(codex 리뷰)
    ...STATIC.map((s) => ({ url: `${SITE_URL}${s.path}`, changeFrequency: s.changeFrequency, priority: s.priority })),
    ...dynamicUrls,
  ];
}
