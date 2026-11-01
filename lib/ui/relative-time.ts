// ============================================================================
// lib/ui/relative-time — 절대 날짜 → 상대 표기("3일 전", "2주 전", "2달 전")
//
// Figma 코멘트 #2(HanSeol, 2026-09-11): "날짜 기준이 아닌 몇일 전·몇달 전으로 서술"
// (유튜브 표기). 고령 독자에게 "2026.09.06"보다 "1주 전"이 지금과의 거리를 바로 준다.
//
// 규칙: 오늘 / 어제 / N일 전(7일 미만) / N주 전(5주 미만) / N달 전(12달 미만) / N년 전.
// 기준은 KST 달력 날짜 — 같은 날이면 시각과 무관하게 "오늘"(발행 데이터가 00:00Z 날짜값이라
// 시차로 하루가 밀리지 않게 한다). 달 차이는 30일 나눗셈이 아니라 달력 월로 센다.
//
// 외부 의존 없는 순수 함수 — now 를 인자로 받아 같은 입력이면 서버·클라이언트 결과가 같다.
// 표기가 하루 단위라 서버 렌더와 하이드레이션이 자정을 사이에 두지 않으면 불일치가 없고,
// /podcast 처럼 force-dynamic 인 페이지는 서버 계산 결과가 그대로 내려간다.
// 절대 날짜는 지우지 않는다 — 호출부는 <time dateTime>·title 에 절대 표기를 남긴다.
// ============================================================================

/** 하루(ms) */
const DAY_MS = 24 * 60 * 60 * 1000;
/** KST = UTC+9 (서버 TZ 와 무관하게 고정 오프셋으로 계산) */
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** KST 달력 기준 날짜 일련번호(1970-01-01 KST = 0) */
function kstDayIndex(ms: number): number {
  return Math.floor((ms + KST_OFFSET_MS) / DAY_MS);
}

/** KST 달력의 연·월(0-based) — 달 차이를 달력 기준으로 세기 위한 값 */
function kstYearMonth(ms: number): { y: number; m: number } {
  const kst = new Date(ms + KST_OFFSET_MS);
  return { y: kst.getUTCFullYear(), m: kst.getUTCMonth() };
}

/** 달력 월 차이 (같은 달이면 0). 일자가 아직 안 지났으면 한 달 뺀다 */
function monthsBetween(fromMs: number, toMs: number): number {
  const a = kstYearMonth(fromMs);
  const b = kstYearMonth(toMs);
  const from = new Date(fromMs + KST_OFFSET_MS);
  const to = new Date(toMs + KST_OFFSET_MS);
  let months = (b.y - a.y) * 12 + (b.m - a.m);
  if (to.getUTCDate() < from.getUTCDate()) months -= 1;
  return Math.max(0, months);
}

/**
 * ISO 문자열 → 상대 표기. 무효/없음이면 "".
 * 미래 시각(발행 예정 등)은 "오늘"로 뭉갠다 — 목록에 "-2일 전"이 뜨지 않게.
 *
 * @param iso  ISO 8601 문자열 (publishedAt 등)
 * @param now  기준 시각(ms 또는 Date). 기본값 Date.now() — 테스트·서버 계산에서 고정 가능
 */
export function relativeKo(
  iso: string | null | undefined,
  now: number | Date = Date.now(),
): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const nowMs = now instanceof Date ? now.getTime() : now;
  if (!Number.isFinite(nowMs)) return "";

  const days = kstDayIndex(nowMs) - kstDayIndex(t);
  if (days <= 0) return "오늘";
  if (days === 1) return "어제";
  if (days < 7) return `${days}일 전`;

  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}주 전`;

  const months = monthsBetween(t, nowMs);
  if (months < 12) return `${Math.max(1, months)}달 전`;

  return `${Math.floor(months / 12)}년 전`;
}

/** ISO → "YYYY. M. D." (KST) — 상대 표기 옆 툴팁·title 용 절대 날짜. 무효면 "" */
export function absoluteKo(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const kst = new Date(d.getTime() + KST_OFFSET_MS);
  return `${kst.getUTCFullYear()}. ${kst.getUTCMonth() + 1}. ${kst.getUTCDate()}.`;
}
