// ============================================================================
// components/home/format — 홈 표시용 포매팅/정렬 유틸 (순수 함수)
//
// 서버·클라이언트 양쪽에서 안전하게 쓰는 순수 함수만 둔다(외부 부작용/서버 전용
// 임포트 금지). 온도 정렬은 서버 초기 페칭과 클라이언트 폴링에서 공유한다.
// ============================================================================

import type { TemperatureBoardItem } from "@/types";

/** ISO 문자열을 "M월 D일" 형태로 (유효하지 않으면 null) */
export function formatMonthDay(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}

/** ISO 문자열을 "M월 D일 HH:MM" 형태로 (유효하지 않으면 null) */
export function formatDateTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${date.getMonth() + 1}월 ${date.getDate()}일 ${hh}:${mm}`;
}

/** 초 단위 재생시간을 "M:SS" 로 (없으면 null) */
export function formatDuration(sec: number | null | undefined): string | null {
  if (sec == null || !Number.isFinite(sec) || sec < 0) return null;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** 온도 보드 항목 정렬 — rank 있으면 오름차순, 없으면 온도 내림차순 */
export function sortTemperatureItems(
  items: TemperatureBoardItem[],
): TemperatureBoardItem[] {
  return items.slice().sort((a, b) => {
    if (a.rank != null && b.rank != null) return a.rank - b.rank;
    return (b.temperature ?? 0) - (a.temperature ?? 0);
  });
}

/** matchScore(0~1)를 신뢰도 % 로 변환 (범위 밖/누락은 null) */
export function confidencePercent(
  score: number | null | undefined,
): number | null {
  if (score == null || !Number.isFinite(score)) return null;
  return Math.round(Math.min(1, Math.max(0, score)) * 100);
}

/** 문자열을 max 자 이내로 절단(초과 시 말줄임표). 앞뒤 공백 제거. */
export function truncate(text: string, max: number): string {
  const t = text.trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

/**
 * 카테고리 문자열을 기상도 이슈 온도(TemperatureBoardItem)와 매핑한다(표시용).
 * 이슈 라벨과 카테고리가 서로를 포함하면 그 항목을 반환, 없으면 null(중립).
 * ⚠️ 데이터 조작이 아니라 "온도 스파인 색"을 결정하기 위한 표시 매핑이다.
 */
export function matchIssueTemperature(
  category: string | null | undefined,
  items: TemperatureBoardItem[],
): TemperatureBoardItem | null {
  const cat = category?.trim().toLowerCase();
  if (!cat) return null;
  return (
    items.find((it) => {
      const label = it.issue?.label?.trim().toLowerCase();
      if (!label) return false;
      return label.includes(cat) || cat.includes(label);
    }) ?? null
  );
}

/** 헤드라인 세그먼트 — quoted=true 는 따옴표로 감싼 인용부(--quote 톤으로 표시) */
export interface HeadlineSegment {
  text: string;
  quoted: boolean;
}

/**
 * 리드 헤드라인을 인용부/일반부로 분해한다(순수).
 * 직선/곡선 큰따옴표로 감싼 구간을 인용부(quoted)로 표시하고, 따옴표 기호도
 * 인용부에 포함한다. 따옴표가 없으면 전체를 일반부 1개로 반환한다.
 */
export function splitQuoted(text: string): HeadlineSegment[] {
  const segments: HeadlineSegment[] = [];
  const re = /["“”][^"“”]*["“”]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      segments.push({ text: text.slice(last, m.index), quoted: false });
    }
    segments.push({ text: m[0], quoted: true });
    last = re.lastIndex;
  }
  if (last < text.length) {
    segments.push({ text: text.slice(last), quoted: false });
  }
  return segments.length > 0 ? segments : [{ text, quoted: false }];
}

/** 순위 변동(상승/하강/유지/신규)을 표시용으로 계산 */
export type RankTrend = "up" | "down" | "same" | "new";

export function rankTrend(
  rank: number | null | undefined,
  prevRank: number | null | undefined,
): RankTrend {
  if (rank == null) return "same";
  if (prevRank == null) return "new";
  if (prevRank > rank) return "up"; // 이전 순위가 낮을(숫자 큼)수록 상승
  if (prevRank < rank) return "down";
  return "same";
}
