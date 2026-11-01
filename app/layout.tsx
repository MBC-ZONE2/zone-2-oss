import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ICON_V } from "@/lib/icon-version";
import { JsonLd } from "@/components/seo/json-ld";
import { organizationJsonLd, websiteJsonLd } from "@/lib/seo/site";
import "./reels.css";
import { ReelsShell } from "@/components/reels/reels-shell";
import { Toaster } from "@/components/ui/sonner";
import { VisitPing } from "@/components/visit-ping";
import { region } from "@/config/region";



// 서체는 globals.css 의 @font-face "Pretendard"(public/fonts 자체 호스팅 가변, KS X 1001 서브셋) 하나.
// next/font(Noto Sans KR·Geist)는 제거했다(2026-09-08 속도 개선): Noto 의 @font-face 497개가
// 모든 화면에서 94KB(gzip) 렌더 차단 CSS 를 만들고 있었다. 폴백은 시스템 한글 서체.

const SITE_URL = region.site.url;
const SITE_DESC = region.site.shortDescription;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: region.site.name, template: `%s · ${region.site.name}` },
  description: SITE_DESC,
  applicationName: region.site.name,
  manifest: "/manifest.webmanifest",
  // canonical = 현재 경로(쿼리 제거) — 검색엔진 중복 URL 방지(2026-10-26 SEO)
  alternates: { canonical: "./" },
  // 파비콘 — 전달받은 ZONE-2 워드마크의 「2」(흑→청 그라데이션)를 흰 바탕에 올린 세트(2026-10-26, 구 검은 바탕 백색원 교체).
  // 원본: public/logos/zone2-black.png. app/opengraph-image.tsx 가 OG 이미지를 만든다.
  // ?v= 는 캐시 무효화용 — Cloudflare 엣지가 옛 아이콘을 HIT 로 계속 내보내 파일명은 두고 URL 만 바꿨다(ICON_V).
  icons: {
    icon: [
      { url: `/icon-32.png?v=${ICON_V}`, sizes: "32x32", type: "image/png" },
      { url: `/icon-192.png?v=${ICON_V}`, sizes: "192x192", type: "image/png" },
      { url: `/icon-512.png?v=${ICON_V}`, sizes: "512x512", type: "image/png" },
    ],
    shortcut: `/icon-192.png?v=${ICON_V}`,
    apple: `/apple-icon.png?v=${ICON_V}`,
  },
  // 검색 소유 확인(2026-10-26 대표 지시) — 네이버 서치어드바이저 메타, 구글은 DNS TXT 로도 확인되지만 메타도 같이 둔다
  verification: {
    google: "JiMvZVUpfSFuYPH-AU5balwoAuwRiJHk_p-dxgaQ9Nw",
    other: { "naver-site-verification": "3a3bf7141f47cc4604bf471fe4c9cbde00dc5e0e" },
  },
  openGraph: {
    type: "website",
    siteName: region.site.name,
    locale: region.site.locale,
    title: `${region.site.name} — 새로운 공론장이 펼쳐지도록`,
    description: SITE_DESC,
    url: "/",
  },
  twitter: { card: "summary_large_image", title: region.site.name, description: SITE_DESC },
  // iOS 홈 화면 추가 시 전체화면 앱처럼 — 상태바 반투명, 앱 이름 지정.
  appleWebApp: {
    capable: true,
    title: region.site.name,
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false },
};

// 뷰포트 — 앱 감각: 확대 잠금, 노치(safe-area) 대응, 상태바 테마색.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f5f7" }, // 종이
    { media: "(prefers-color-scheme: dark)", color: "#0b0d12" }, // 검은 세계
  ],
};

// 하이드레이션 이전에 저장된 표시 설정(큰글씨·고대비)을 선반영해 FOUC/불일치 방지.
const DISPLAY_SETTINGS_SCRIPT = `(function(){try{var d=document.documentElement;var f=localStorage.getItem("zone2-font-size");if(f==="large")d.setAttribute("data-font-size","large");var c=localStorage.getItem("zone2-contrast");if(c==="high")d.setAttribute("data-contrast","high");}catch(e){}})();`;

// 컨셉 영상 인트로 커버 — 홈(/)에서 인트로가 재생될 조건이면 하이드레이션 이전에
// data-intro-pending 을 붙여, 홈이 잠깐 보였다 인트로가 덮는 플래시를 없앤다.
// (BrandIntro가 마운트되면 그 위(z-index 120)를 덮고, 종료 시 이 속성을 지운다.)
// 안전장치: JS 실패로 인트로가 안 뜨면 15초 후 커버를 자동 제거한다.
// "오늘 하루 안보기"(localStorage zone2.intro.hideDate.v1 == 오늘 local 날짜)가
// 아닌 한 매 방문 인트로가 뜨므로, 그 조건에서만 프리페인트 커버를 붙인다.
const INTRO_COVER_SCRIPT = `(function(){try{if(location.pathname==="/"&&localStorage.getItem("zone2.intro.hideDate.v1")!==new Date().toLocaleDateString("en-CA")&&!(window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches)){var d=document.documentElement;d.setAttribute("data-intro-pending","1");setTimeout(function(){d.removeAttribute("data-intro-pending");},15000);}}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: 아래 인라인 스크립트가 hydrate 전에 <html>에
    // data-font-size/data-contrast 를 넣으므로 속성 불일치 경고를 억제한다.
    <html lang={region.site.lang} suppressHydrationWarning>
      <head>
        {/* iOS 홈 화면 아이콘 */}
        <link rel="apple-touch-icon" href={`/apple-icon.png?v=${ICON_V}`} />
        {/* Pretendard 가변 폰트 프리로드 — 표지 5문장이 인트로 캔버스와 같은 서체로
            첫 프레임부터 찍히도록(FOUT 최소화). globals.css @font-face 와 동일 경로. */}
        <link
          rel="preload"
          href="/fonts/PretendardVariable.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        {/* FOUC 방지 — 정적 문자열(사용자 입력 없음). strict CSP(script-src) 도입 시 nonce 부여 필요 */}
        <script dangerouslySetInnerHTML={{ __html: DISPLAY_SETTINGS_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: INTRO_COVER_SCRIPT }} />
      </head>
      {/* body 서체는 globals.css --font-sans("Pretendard" → Noto → Geist) 가 결정한다.
          next/font 변수 클래스는 폴백 서체 변수를 주입할 뿐 우선순위를 바꾸지 않는다. */}
      <body
        className="antialiased"
      >
        {/* 구조화 데이터 — 발행 주체(NewsMediaOrganization)·사이트(WebSite). 상세 페이지는 자기 것(NewsArticle 등)을 더 얹는다 */}
        <JsonLd data={[organizationJsonLd(), websiteJsonLd()]} />
        {/* 릴스 전용 풀스크린 셸: 데스크톱 좌측 SideNav + 모바일 하단 FloatingNav.
            홈은 좌우 패널 없는 풀블리드 릴스 덱, 그 외 라우트는 중앙 컬럼.
            /admin 은 셸 없이 자체 레이아웃. */}
        <ReelsShell>{children}</ReelsShell>
        <Toaster />
        {/* 방문 신호(검증지표 ④ 재방문율, #181) — 하루 1회 익명 UUID 해시만 남긴다.
            Cloudflare Web Analytics 비콘(#116)은 재방문 지표가 없어 2026-10-11 제거. */}
        <VisitPing />
      </body>
    </html>
  );
}
