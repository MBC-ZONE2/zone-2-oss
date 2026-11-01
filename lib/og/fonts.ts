// ============================================================================
// lib/og/fonts — OG 이미지(next/og)용 한글 폰트 로더 (GH#18)
//
// satori(ImageResponse)는 폰트 바이너리를 직접 받아야 한다. next/font 는 CSS 주입
// 방식이라 여기서 쓸 수 없고, 한글 전체 글립을 담은 Noto Serif KR 은 수 MB 라
// 리포에 넣기 부담스럽다.
//
// 그래서 Google Fonts 의 text= 서브셋을 쓴다 — 렌더할 문자만 담은 폰트를 받으므로
// 보통 10KB 안팎이다. 같은 문자 집합은 프로세스 캐시로 재사용한다.
//
// ⚠️ 렌더 시점에 fonts.googleapis.com 접근이 필요하다. 실패 시 null 을 반환하고
//    호출부가 폰트 없이 렌더한다(라틴은 정상, 한글은 대체 글립).
//    폐쇄망 배포로 가면 서브셋 폰트를 리포에 번들하는 방식으로 교체한다.
// ============================================================================

const FONT_FAMILY = "Noto Serif KR";

/**
 * 문자집합별 폰트 캐시 (키: weight + 정렬된 유니크 문자).
 *
 * 카드마다 문자집합이 사실상 고유해서 캐시 적중률이 높지 않다. 무제한으로 두면
 * 오래 사는 프로세스(셀프호스트 서버·Worker isolate)에서 요청이 쌓일수록
 * 메모리가 단조 증가한다 → 항목 수를 제한한 LRU 로 운용한다.
 * (Map 은 삽입 순서를 보존하므로 재조회 시 재삽입하면 LRU 가 된다)
 */
const MAX_CACHE_ENTRIES = 32;
const cache = new Map<string, ArrayBuffer | null>();

/** LRU 조회 — 적중 시 최신으로 끌어올린다 */
function cacheGet(key: string): ArrayBuffer | null | undefined {
  if (!cache.has(key)) return undefined;
  const value = cache.get(key);
  cache.delete(key);
  cache.set(key, value ?? null);
  return value;
}

/** LRU 저장 — 한도를 넘으면 가장 오래된 항목부터 버린다 */
function cacheSet(key: string, value: ArrayBuffer | null): void {
  cache.set(key, value);
  while (cache.size > MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

/** 요청 문자에서 유니크 문자만 정렬해 캐시 키 겸 서브셋 텍스트를 만든다 */
function subsetText(text: string): string {
  return [...new Set(text)].sort().join("");
}

/** Google Fonts CSS 에서 폰트 파일 URL 을 뽑는다 */
function extractFontUrl(css: string): string | null {
  return css.match(/src:\s*url\(([^)]+)\)/)?.[1] ?? null;
}

/**
 * 렌더할 문자만 담은 Noto Serif KR 서브셋을 받는다.
 *
 * @param text 이미지에 그려질 전체 문자열
 * @param weight 폰트 굵기 (400 | 700)
 * @returns 폰트 바이너리. 네트워크 실패 시 null
 */
export async function loadKoreanFont(
  text: string,
  weight: 400 | 700,
  family: string = FONT_FAMILY, // OG 이미지는 본문과 같은 산세리프(Noto Sans KR)를 쓴다
): Promise<ArrayBuffer | null> {
  const chars = subsetText(text);
  if (!chars) return null;

  const key = `${family}:${weight}:${chars}`;
  const cached = cacheGet(key);
  if (cached !== undefined) return cached;

  const font = await fetchSubset(chars, weight, family);
  cacheSet(key, font);
  return font;
}

async function fetchSubset(
  chars: string,
  weight: 400 | 700,
  family: string = FONT_FAMILY,
): Promise<ArrayBuffer | null> {
  const cssUrl =
    `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, "+")}` +
    `:wght@${weight}&text=${encodeURIComponent(chars)}`;

  try {
    // UA 를 지정해야 Google 이 woff2/ttf 중 하나를 확정해 준다.
    const cssResponse = await fetch(cssUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!cssResponse.ok) return null;

    const fontUrl = extractFontUrl(await cssResponse.text());
    if (!fontUrl) return null;

    const fontResponse = await fetch(fontUrl, {
      signal: AbortSignal.timeout(8_000),
    });
    if (!fontResponse.ok) return null;

    return await fontResponse.arrayBuffer();
  } catch {
    return null; // 폰트 실패가 이미지 생성 전체를 막지 않게 한다
  }
}

/** ImageResponse fonts 옵션 형태로 변환 (null 은 걸러낸다) */
export async function koreanFontSet(text: string): Promise<
  Array<{ name: string; data: ArrayBuffer; weight: 400 | 700; style: "normal" }>
> {
  const [regular, bold] = await Promise.all([
    loadKoreanFont(text, 400),
    loadKoreanFont(text, 700),
  ]);

  const fonts: Array<{
    name: string;
    data: ArrayBuffer;
    weight: 400 | 700;
    style: "normal";
  }> = [];
  if (regular) fonts.push({ name: FONT_FAMILY, data: regular, weight: 400, style: "normal" });
  if (bold) fonts.push({ name: FONT_FAMILY, data: bold, weight: 700, style: "normal" });
  return fonts;
}
