// ============================================================================
// lib/seo/site — 검색·생성형 검색(GEO) 공통 상수와 JSON-LD 빌더 (2026-10-26 대표 지시)
//
// 쓰는 곳: app/layout(Organization·WebSite), 크로스뷰 상세(NewsArticle), 팟캐 상세(PodcastEpisode),
// app/robots·sitemap·news-sitemap.xml·feed.xml, lib/seo/indexnow.
// 근거: Google Article 구조화 데이터 가이드(developers.google.com/search/docs/appearance/structured-data/article),
//       Google 뉴스 사이트맵(…/sitemaps/news-sitemap), schema.org NewsMediaOrganization·PodcastEpisode.
// 개인정보: 여기 담기는 것은 매체명·공개 URL·로고뿐이다. 사람 이름·이메일은 넣지 않는다.
// ============================================================================

import { region } from "@/config/region";

export const SITE_URL = region.site.url;
export const SITE_NAME = region.site.name;
export const SITE_DESCRIPTION = region.site.description;

/** 상대 경로를 절대 URL 로. 이미 절대면 그대로 */
export function absUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  if (/^https?:\/\//i.test(path)) return path;
  return `${SITE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}

const ORG_ID = `${SITE_URL}/#organization`;
const SITE_ID = `${SITE_URL}/#website`;

/** 발행 주체 — 컨소시엄. 양사 공식 사이트를 sameAs 로 잇는다 */
export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "NewsMediaOrganization",
    "@id": ORG_ID,
    name: SITE_NAME,
    alternateName: `${region.site.name} · ${region.consortium.label}`,
    url: SITE_URL,
    description: SITE_DESCRIPTION,
    logo: { "@type": "ImageObject", url: `${SITE_URL}/icon-512.png`, width: 512, height: 512 },
    image: `${SITE_URL}/opengraph-image`,
    foundingDate: "2026",
    areaServed: { "@type": "AdministrativeArea", name: region.place.areaServed },
    knowsLanguage: region.site.lang,
    publishingPrinciples: `${SITE_URL}/about`,
    // 양사 공식 사이트 — 컨소시엄 구성원
    sameAs: [region.outlets.macro.url, region.outlets.micro.url],
    parentOrganization: [
      { "@type": "NewsMediaOrganization", name: region.outlets.macro.name, url: region.outlets.macro.url },
      { "@type": "NewsMediaOrganization", name: region.outlets.micro.name, url: region.outlets.micro.url },
    ],
  };
}

/** 사이트 — 이름·언어·발행 주체. (사이트 내 검색이 없어 SearchAction 은 넣지 않는다) */
export function websiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": SITE_ID,
    name: SITE_NAME,
    url: SITE_URL,
    description: SITE_DESCRIPTION,
    inLanguage: "ko",
    publisher: { "@id": ORG_ID },
  };
}

/** 크로스뷰 상세 — NewsArticle. 두 원문은 isBasedOn 으로 출처를 명시한다 */
export function crossviewArticleJsonLd(p: {
  id: string;
  headline: string;
  description: string | null;
  datePublished: string;
  image?: string | null;
  section?: string | null;
  keywords?: string[] | null;
  sources: { name: string; url: string; title: string; datePublished?: string | null }[];
}) {
  const url = `${SITE_URL}/crossview/${p.id}`;
  return {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    "@id": `${url}#article`,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    url,
    headline: p.headline.slice(0, 110),
    description: p.description ?? undefined,
    datePublished: p.datePublished,
    dateModified: p.datePublished,
    inLanguage: "ko",
    isAccessibleForFree: true,
    articleSection: p.section ?? undefined,
    keywords: p.keywords?.length ? p.keywords.join(", ") : undefined,
    image: p.image ? [p.image] : undefined,
    author: { "@type": "Organization", name: `${region.site.name} 크로스뷰`, url: `${SITE_URL}/crossview` },
    publisher: { "@id": ORG_ID },
    // 원문 두 건 — 요약·비교의 근거. 각 매체 저작물임을 구조적으로 남긴다
    isBasedOn: p.sources.map((s) => ({
      "@type": "NewsArticle",
      headline: s.title,
      url: s.url,
      datePublished: s.datePublished ?? undefined,
      publisher: { "@type": "NewsMediaOrganization", name: s.name },
    })),
  };
}

/** 팟캐 상세 — PodcastEpisode + AudioObject */
export function podcastEpisodeJsonLd(p: {
  id: string;
  name: string;
  description: string;
  datePublished: string | null;
  durationSec: number | null;
  image?: string | null;
}) {
  const url = `${SITE_URL}/podcast/${p.id}`;
  const dur =
    typeof p.durationSec === "number" && p.durationSec > 0
      ? `PT${Math.floor(p.durationSec / 60)}M${Math.round(p.durationSec % 60)}S`
      : undefined;
  return {
    "@context": "https://schema.org",
    "@type": "PodcastEpisode",
    "@id": `${url}#episode`,
    url,
    name: p.name,
    description: p.description,
    datePublished: p.datePublished ?? undefined,
    inLanguage: "ko",
    image: p.image ?? undefined,
    timeRequired: dur,
    associatedMedia: {
      "@type": "AudioObject",
      contentUrl: `${SITE_URL}/api/podcast/${p.id}/audio`,
      encodingFormat: "audio/mpeg",
      duration: dur,
    },
    partOfSeries: {
      "@type": "PodcastSeries",
      name: region.podcast.seriesName,
      url: `${SITE_URL}/podcast`,
      webFeed: `${SITE_URL}/feed.xml`,
    },
    publisher: { "@id": ORG_ID },
  };
}

/** XML 특수문자 이스케이프 (사이트맵·RSS 공용). XML 1.0 이 금지한 제어문자는 지운다 — 하나만 섞여도 문서 전체가 파싱 불가 */
export function xmlEscape(s: string): string {
  return s
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uFFFE\uFFFF]/g, "")
    .replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c] as string);
}
