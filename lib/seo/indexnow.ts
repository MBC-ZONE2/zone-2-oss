// ============================================================================
// lib/seo/indexnow — IndexNow 알림 (네이버 서치어드바이저 2023-07 부터 지원, Bing·Yandex 공유)
//
// 크로스뷰 승인·팟캐 공개 직후 새 URL 을 알린다(색인을 보장하진 않지만 발견을 앞당긴다).
// 키: INDEXNOW_KEY(.env.local, 32자 16진수). 키 파일은 /indexnow-key.txt 라우트가 낸다(keyLocation).
// 실패해도 조용히 — 검수 응답을 막지 않는다. 키가 없으면 아무것도 하지 않는다. Google 은 IndexNow 미지원(사이트맵으로).
// ============================================================================

import { SITE_URL } from "./site";

export const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";

export function indexNowKey(): string | null {
  const k = process.env.INDEXNOW_KEY?.trim();
  return k && /^[a-f0-9]{32,64}$/i.test(k) ? k : null;
}

/** 사이트 내 경로 목록을 알린다. 비동기, 결과는 로그만 */
export async function pingIndexNow(paths: string[]): Promise<void> {
  const key = indexNowKey();
  if (!key || paths.length === 0) return;
  const urlList = paths.map((p) => `${SITE_URL}${p.startsWith("/") ? "" : "/"}${p}`);
  try {
    const res = await fetch(INDEXNOW_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ host: new URL(SITE_URL).host, key, keyLocation: `${SITE_URL}/indexnow-key.txt`, urlList }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok && res.status !== 202) console.warn(`[indexnow] ${res.status} ${urlList.length}건`);
  } catch (e) {
    console.warn("[indexnow] 실패:", e instanceof Error ? e.message : e);
  }
}
