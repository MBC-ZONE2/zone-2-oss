import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo/site";

// robots.txt — 검색 로봇(Googlebot·네이버 Yeti·Bingbot 등) 모두 허용, 관리자·크론·개인 API 만 제외.
// Cloudflare 가 "Content-Signal"(AI 학습 금지, 검색 허용) 관리 블록을 앞에 덧붙여 내보낸다 — 여기서 중복해 쓰지 않는다.
// 사이트맵 두 개: 전체(sitemap.xml) + 최근 2일 기사 전용 뉴스 사이트맵(news-sitemap.xml, Google News 규격).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/api/crossview/"], // 크로스뷰 카드 이미지(/api/crossview/:id/card/:n)는 OG 이미지라 열어 둔다
        disallow: ["/admin", "/api/admin/", "/api/cron/", "/api/visit", "/api/forum/", "/login", "/auth/", "/embed"],
      },
    ],
    sitemap: [`${SITE_URL}/sitemap.xml`, `${SITE_URL}/news-sitemap.xml`],
    host: SITE_URL,
  };
}
