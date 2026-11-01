// ============================================================================
// components/crossview/text — 크로스뷰 조판용 순수 텍스트 함수 (서버/클라 공용)
//
// - splitHeadline: card_headline 을 쉼표 기준 두 줄(광역 ⋯ / 기초 ▬)로 나눈다.
//   (components/reels/slides.tsx 의 동명 함수와 같은 규칙 — slides 는 "use client"
//    모듈이라 서버 컴포넌트에서 함수를 직접 부를 수 없어 여기 순수 사본을 둔다.)
// - keywordIntersection / segmentByKeywords: 시그니처 「교집합 낱말만 잉크 700」.
//   양쪽 articles.keywords 교집합을 구하고, 본문을 (일치/불일치) 조각으로 분해한다.
// ============================================================================

/** card_headline → 쉼표(, ，) 앞뒤 두 줄. 없으면 [], 쉼표 없으면 한 줄 */
export function splitHeadline(headline: string | null | undefined): string[] {
  const h = String(headline || "").replace(/\s+/g, " ").trim();
  if (!h) return [];
  const idx = h.search(/[,，]/);
  if (idx < 0) return [h];
  const a = h.slice(0, idx).trim();
  const b = h.slice(idx + 1).trim();
  return b ? [a, b] : [a];
}

/** 첫 문장(마침표·물음표·느낌표 뒤 공백/끝 기준). 없으면 전체 */
export function firstSentence(text: string | null | undefined): string {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  const m = t.match(/^[\s\S]*?[.。!?](?=\s|$)/);
  return m ? m[0].trim() : t;
}

/** 공백 정리 + 말줄임 발췌 */
export function excerpt(text: string | null | undefined, max = 160): string {
  const flat = String(text || "").replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

/** keywords(unknown[]) → 2자 이상 문자열, 중복 제거 */
export function normalizeKeywords(list: readonly unknown[] | null | undefined): string[] {
  if (!Array.isArray(list)) return [];
  const out = new Set<string>();
  for (const k of list) {
    if (typeof k !== "string") continue;
    const s = k.replace(/\s+/g, " ").trim();
    if (s.length >= 2) out.add(s);
  }
  return Array.from(out);
}

/** 양쪽 keywords 교집합(대소문자 무시). 긴 낱말 우선 정렬 — 겹치는 낱말은 긴 쪽이 먼저 잡히도록 */
export function keywordIntersection(
  a: readonly unknown[] | null | undefined,
  b: readonly unknown[] | null | undefined,
): string[] {
  const left = normalizeKeywords(a);
  const right = new Set(normalizeKeywords(b).map((k) => k.toLowerCase()));
  return left
    .filter((k) => right.has(k.toLowerCase()))
    .sort((x, y) => y.length - x.length || x.localeCompare(y, "ko"));
}

export interface TextSegment {
  text: string;
  /** 교집합 낱말 여부 */
  hit: boolean;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 본문을 교집합 낱말 기준으로 (일치/불일치) 조각으로 분해한다. 낱말이 없으면 통째 1조각 */
export function segmentByKeywords(
  text: string,
  keywords: readonly string[],
): TextSegment[] {
  const t = String(text || "");
  if (!t) return [];
  const keys = keywords.filter((k) => k.length > 0);
  if (keys.length === 0) return [{ text: t, hit: false }];
  const re = new RegExp(`(${keys.map(escapeRegExp).join("|")})`, "gi");
  const parts = t.split(re);
  const out: TextSegment[] = [];
  parts.forEach((part, i) => {
    if (!part) return;
    // split 의 캡처 그룹은 홀수 인덱스에 놓인다
    out.push({ text: part, hit: i % 2 === 1 });
  });
  return out;
}
