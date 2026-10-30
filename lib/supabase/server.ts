import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const PUBLIC_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;

// [성능] self-host 에서 서버는 공개 도메인(auth.mbcok.com) 대신 **로컬 Supabase**
//   로 직접 질의한다. 공개 URL 은 인터넷→Cloudflare→터널→로컬 DB 왕복이라 쿼리당
//   ~600ms 지만, 같은 기계의 localhost:54321 은 ~15ms 다(실측 40배). 클라이언트에
//   설정하는 URL(쿠키 storageKey·인증 흐름)은 그대로 두고 **실제 fetch 의 host 만**
//   내부 URL 로 치환해, 인증/RLS 세션 의미를 전혀 바꾸지 않는다.
//   SUPABASE_INTERNAL_URL 미설정 환경(개발·CI)에서는 공개 URL 그대로 동작한다.
const INTERNAL_URL = process.env.SUPABASE_INTERNAL_URL?.replace(/\/$/, "");

const internalFetch: typeof fetch | undefined = INTERNAL_URL
  ? (input, init) => {
      const orig =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      if (orig.startsWith(PUBLIC_URL)) {
        const rewritten = INTERNAL_URL + orig.slice(PUBLIC_URL.length);
        if (typeof input === "string" || input instanceof URL) {
          return fetch(rewritten, init);
        }
        // Request 객체는 메서드·헤더·바디를 보존해 재구성한다.
        return fetch(new Request(rewritten, input), init);
      }
      return fetch(input, init);
    }
  : undefined;

/** 내부 URL 라우팅 fetch 를 supabase 클라이언트 옵션에 얹는다(설정 시에만). */
const globalOption = internalFetch ? { global: { fetch: internalFetch } } : {};

/**
 * 서버(Server Component / Route Handler)용 Supabase 클라이언트.
 * Next.js cookies API 로 세션을 읽고 쓴다 (@supabase/ssr 권장 패턴).
 *
 * 주의: Server Component 에서 setAll 호출은 무시될 수 있다.
 *       세션 갱신은 middleware 에서 수행한다 (Phase 2 그룹 E).
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      ...globalOption,
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Server Component 에서 호출된 경우 — middleware 가 세션을 갱신하므로 무시.
          }
        },
      },
    },
  );
}

/**
 * service_role 키를 사용하는 관리자/Cron 전용 클라이언트.
 * RLS 를 우회하므로 서버 사이드(Workers/Route Handler)에서만 사용한다.
 * 쿠키 세션을 쓰지 않는다.
 */
export function createServiceClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      ...globalOption,
      cookies: {
        getAll() {
          return [];
        },
        setAll() {
          // service 클라이언트는 쿠키를 사용하지 않는다.
        },
      },
    },
  );
}
