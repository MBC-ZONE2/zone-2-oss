import type { NextConfig } from "next";

// 임베드 위젯(F8) 공개 API 의 CORS 는 **middleware.ts** 에서 처리한다(#121).
// 정적 헤더는 Access-Control-Allow-Origin 값이 하나뿐이라 양사 두 도메인을
// 동시에 허용할 수 없어, 요청 Origin 을 허용목록과 대조해 반사하는 방식으로
// 옮겼다. WIDGET_ALLOWED_ORIGIN 은 콤마로 여러 오리진을 넣는다.
const nextConfig: NextConfig = {
  // 빌드 시 ESLint/타입 에러를 그대로 노출 (Phase 0 계약 정확도 유지)
  eslint: {
    ignoreDuringBuilds: false,
  },
  // public/ 정적 자산 장기 캐시 — Cloudflare 엣지가 1년 캐시(파일명이 바뀌지 않는 것은 배포 시 교체하므로
  // 폰트·아이콘만). 기본값(max-age=0)이면 엣지가 매번 원점(터널)을 다시 물어 0.5초씩 든다(속도 개선 2026-09-08).
  async headers() {
    const immutable = [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }];
    // 보안 헤더(보안 검수 2026-10-26). /embed·/widgets 는 다른 사이트에 끼워 넣는 용도라 프레임 제한에서 뺀다. CSP 는 인라인 스크립트·gsap 때문에 보류.
    const security = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
    ];
    return [
      { source: "/:path*", headers: security },
      { source: "/:path((?!embed|widgets/).*)", headers: [{ key: "X-Frame-Options", value: "SAMEORIGIN" }] },
      { source: "/fonts/:path*", headers: immutable },
      { source: "/:name(icon-192|icon-512|icon-maskable-512|apple-icon).png", headers: immutable },
      // 공개 HTML(익명 동일 콘텐츠)은 엣지가 60초 캐시 + 10분 stale 재검증 — Cloudflare 캐시 규칙("HTML 캐시")을 켜야 실제로 먹는다
      {
        source: "/:path((?!api/|admin|forum|fonts/|_next/|opengraph-image|.*\\.png$).*)", // 폰트·아이콘은 위 immutable 규칙이 이겨야 한다(뒤 규칙이 덮어쓰므로 제외) // 공론장은 글 올린 직후 목록 반영이 우선이라 제외
        headers: [{ key: "Cache-Control", value: "public, s-maxage=60, stale-while-revalidate=600" }],
      },
    ];
  },
};

export default nextConfig;
