// ============================================================================
// middleware — Supabase 세션 갱신 (@supabase/ssr 표준 패턴)
//
// 출처: docs/06-API명세.md §2 (관리자 인증: Supabase Auth 세션)
// 모든 요청 전에 세션을 갱신해 만료된 토큰을 자동으로 재발급한다.
//   - Server Component 의 setAll 은 무시되므로(lib/supabase/server.ts 참고)
//     실제 세션 쿠키 갱신은 이 미들웨어에서 수행한다.
//   - 권한(role) 검사 등 라우트별 보호는 각 기능 담당이 추가한다.
// ============================================================================

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// ── 임베드 위젯(F8) 공개 API 의 CORS ─────────────────────────────────────
// Access-Control-Allow-Origin 은 값이 **하나**뿐이라 정적 헤더로는 양사(옥천·MBC)
// 두 도메인을 동시에 허용할 수 없다. 그래서 요청 Origin 을 허용목록과 대조해
// **일치하면 그 Origin 을 그대로 반사**한다(#121). 목록은 콤마로 여러 개.
//   WIDGET_ALLOWED_ORIGIN="https://www.okinews.com,https://www.mbccb.co.kr"
// 개발(NODE_ENV!=production)에서 미설정이면 "*"(전체 허용)로 편의를 준다.
const WIDGET_API_PATHS = new Set(["/api/crossview", "/api/temperature"]);
const WIDGET_ALLOWLIST = (
  process.env.WIDGET_ALLOWED_ORIGIN ||
  (process.env.NODE_ENV === "production" ? "" : "*")
)
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

/** 요청 Origin 이 허용되면 반사할 값을, 아니면 null 을 돌려준다. */
function corsAllowOrigin(origin: string | null): string | null {
  if (WIDGET_ALLOWLIST.includes("*")) return origin || "*";
  if (origin && WIDGET_ALLOWLIST.includes(origin)) return origin;
  return null;
}

function applyWidgetCors(res: NextResponse, allow: string): void {
  res.headers.set("Access-Control-Allow-Origin", allow);
  res.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.headers.set("Access-Control-Max-Age", "600");
  // 오리진별로 응답이 달라지므로 캐시가 섞이지 않게 Vary 를 명시한다.
  res.headers.append("Vary", "Origin");
}

export async function middleware(request: NextRequest) {
  // 정본 도메인: www.mbcok.com → mbcok.com (301). 같은 앱을 두 도메인이
  // 서빙하므로 하나로 통일한다. 로컬(localhost)·기타 호스트는 통과.
  if (request.headers.get("host") === "www.mbcok.com") {
    const target = new URL(
      request.nextUrl.pathname + request.nextUrl.search,
      "https://mbcok.com",
    );
    return NextResponse.redirect(target, 301);
  }

  // 임베드 위젯 공개 API 는 세션 갱신이 필요 없고(자격증명 없이 읽음), 대신
  // CORS 반사를 붙여 조기 반환한다. OPTIONS 프리플라이트도 여기서 처리한다.
  if (WIDGET_API_PATHS.has(request.nextUrl.pathname)) {
    const allow = corsAllowOrigin(request.headers.get("origin"));
    if (request.method === "OPTIONS") {
      const res = new NextResponse(null, { status: 204 });
      if (allow) applyWidgetCors(res, allow);
      return res;
    }
    const res = NextResponse.next({ request });
    if (allow) applyWidgetCors(res, allow);
    return res;
  }

  // 요청 쿠키를 그대로 전달하는 응답으로 시작한다.
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // 1) 요청 쿠키 갱신 (이후 핸들러가 읽는 값)
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          // 2) 응답을 재생성하고 동일 쿠키를 응답에도 설정 (브라우저 전달)
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  // getUser() 호출이 만료 토큰을 갱신하고 setAll 을 트리거한다.
  // 중요: createServerClient 와 getUser() 사이에 다른 로직을 넣지 않는다.
  await supabase.auth.getUser();

  return supabaseResponse;
}

export const config = {
  // 정적 파일/이미지 최적화 요청을 제외한 모든 경로에서 실행한다.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|news-sitemap.xml|feed.xml|llms.txt|indexnow-key.txt|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
