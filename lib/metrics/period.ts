// ============================================================================
// lib/metrics/period — 검증지표 측정 구간 (10월 / 시범단 / 최근 30일 / 결과보고 2주 / 결과보고 누적), KST 날짜 유틸
//
// "전체 누적"(7/1~) 구간은 2026-10-29 대표 지시("전체 누적하지 말고 10월 것만")로 없앴다 — 기본 구간은 10월(10/1~오늘, 10/31 까지).
//
// 결과보고 프리셋 2개(#190, 대표 결정 2026-10-25): 재방문율은 "정해진 2주 값 + 기간을 밝힌 누적 값"을 함께 쓴다.
//   report2w  — 10/11~10/24 고정(14일, 완결된 날짜만). 보고서 2주 칸.
//   reportcum — 10/11~어제(오늘은 진행 중이라 제외). 보고서 누적 칸은 10/31 에 10/11~10/30 으로 고정해 적는다.
// ============================================================================

export type PeriodKey = "oct" | "pilot" | "30d" | "report2w" | "reportcum";
export const PERIOD_KEYS: readonly PeriodKey[] = ["oct", "report2w", "reportcum", "pilot", "30d"];
/** 기본 구간(화면·API·CLI) */
export const DEFAULT_PERIOD: PeriodKey = "oct";

/** 시범단 실사용 기간(#164) */
export const PILOT_RANGE = { since: "2026-09-24", until: "2026-10-11" } as const;
/** 결과보고 2주 구간(#190) — 방문 기록 시작일(10/11)부터 14일 */
export const REPORT_2W_RANGE = { since: "2026-10-11", until: "2026-10-24" } as const;
/** 10월 구간(기본) — 운영 달. until 은 오늘을 넘지 않는다 */
export const OCT_RANGE = { since: "2026-10-01", until: "2026-10-31" } as const;

export interface Period {
  key: PeriodKey;
  label: string;
  /** YYYY-MM-DD (KST, 포함) */
  since: string;
  /** YYYY-MM-DD (KST, 포함) — 오늘을 넘지 않는다 */
  until: string;
  /** 달력 일수 */
  days: number;
}

export const PERIOD_LABEL: Record<PeriodKey, string> = {
  oct: "10월 10/1~10/31",
  pilot: `시범단 ${PILOT_RANGE.since.slice(5).replace("-", "/")}~${PILOT_RANGE.until.slice(5).replace("-", "/")}`,
  "30d": "최근 30일",
  report2w: `결과보고 2주 ${REPORT_2W_RANGE.since.slice(5).replace("-", "/")}~${REPORT_2W_RANGE.until.slice(5).replace("-", "/")}`,
  reportcum: "결과보고 누적 10/11~어제",
};

export function isPeriodKey(v: unknown): v is PeriodKey {
  return typeof v === "string" && (PERIOD_KEYS as readonly string[]).includes(v);
}

/** KST YYYY-MM-DD */
export function kstToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 두 날짜 사이 일수(양끝 포함) */
export function daysBetween(since: string, until: string): number {
  return Math.round((Date.parse(`${until}T00:00:00Z`) - Date.parse(`${since}T00:00:00Z`)) / 86_400_000) + 1;
}

/** KST 자정 경계를 ISO 로 — created_at >= fromIso and < toIso */
export function kstBounds(since: string, until: string): { fromIso: string; toIso: string } {
  return {
    fromIso: new Date(`${since}T00:00:00+09:00`).toISOString(),
    toIso: new Date(`${shiftDate(until, 1)}T00:00:00+09:00`).toISOString(),
  };
}

export function resolvePeriod(key: PeriodKey, now: Date = new Date()): Period {
  const today = kstToday(now);
  let since: string;
  let until: string;
  if (key === "pilot") {
    since = PILOT_RANGE.since;
    until = PILOT_RANGE.until;
  } else if (key === "30d") {
    since = shiftDate(today, -29);
    until = today;
  } else if (key === "report2w") {
    since = REPORT_2W_RANGE.since;
    until = REPORT_2W_RANGE.until;
  } else if (key === "reportcum") {
    since = REPORT_2W_RANGE.since;
    until = shiftDate(today, -1); // 어제까지 — 오늘은 방문이 진행 중이라 뺀다
    if (until < since) until = since;
  } else {
    since = OCT_RANGE.since;
    until = OCT_RANGE.until;
  }
  if (until > today) until = today;
  return { key, label: PERIOD_LABEL[key], since, until, days: daysBetween(since, until) };
}

/** "9/24~10/11" 식 짧은 표기 */
export function shortRange(since: string, until: string): string {
  const f = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
  return since === until ? f(since) : `${f(since)}~${f(until)}`;
}
