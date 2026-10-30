// ============================================================================
// lib/ingest/text — 수집 텍스트 정리 (제목·본문 공통, 어댑터가 무엇을 넘기든 여기서 한 번 더)
//
// #189 B(2026-10-22): 크로스뷰 목록에 MBC 제목이 `R)`(리포트 표식)로 시작하거나 옥천신문 제목에
// `&apos;` 가 그대로 남아 있었다 — 어댑터마다 엔티티 복원 목록이 달랐고(okinews 는 &apos; 없음),
// MBC og:title 의 `R)` 접두는 아무도 떼지 않았다. normalize 가 모든 어댑터의 단일 관문이므로 여기서 정리한다.
// ============================================================================

const NAMED: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", hellip: "…", middot: "·", ndash: "–", mdash: "—",
  lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”",
};

/** HTML/XML 엔티티 복원 — 이름형(위 목록)·10진·16진. 두 번 인코딩된 `&amp;lt;` 도 한 번 더 돌려 복원한다 */
export function decodeHtmlEntities(value: string): string {
  const once = (s: string) =>
    s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, ent: string) => {
      const e = ent.toLowerCase();
      if (e.startsWith("#x")) {
        const cp = Number.parseInt(e.slice(2), 16);
        return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
      }
      if (e.startsWith("#")) {
        const cp = Number(e.slice(1));
        return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
      }
      return NAMED[e] ?? m;
    });
  let out = once(value);
  if (/&(#x[0-9a-f]+|#\d+|[a-z]+);/i.test(out)) out = once(out);
  return out;
}

/** MBC충북 리포트 표식 — og:title 이 `R)제목` 또는 (제목이 아직 안 채워진) `R)` 뿐인 경우가 있다 */
const REPORT_PREFIX = /^\s*(?:R|r|리포트)\)\s*/;

/** 제목 정리: 엔티티 복원 → (MBC충북만) 리포트 표식 제거 → 공백 정리.
 *  표식만 있던 제목은 빈 문자열이 된다(호출측이 건너뛴다). 다른 매체의 `R)…` 는 정당한 제목일 수 있어 손대지 않는다 */
export function cleanTitle(value: string, opts: { stripReportMark?: boolean } = {}): string {
  const decoded = decodeHtmlEntities(value);
  return (opts.stripReportMark ? decoded.replace(REPORT_PREFIX, "") : decoded).replace(/\s+/g, " ").trim();
}

/** 본문 정리: 엔티티 복원만(줄바꿈은 보존) */
export function cleanBody(value: string): string {
  return decodeHtmlEntities(value).replace(/[ \t]+\n/g, "\n").trim();
}
