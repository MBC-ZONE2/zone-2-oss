// ============================================================================
// components/podcast/format — 팟캐스트 UI 표시용 포맷 헬퍼
// (공유 lib/utils 를 건드리지 않기 위해 모듈 내부에 둔다)
// ============================================================================

/** 초 → "M:SS" (예: 312 → "5:12") */
export function formatDuration(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec) || sec <= 0) return "--:--";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** ISO 문자열 → "YYYY.MM.DD" (KST). 없으면 빈 문자열. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = (kst.getUTCMonth() + 1).toString().padStart(2, "0");
  const day = kst.getUTCDate().toString().padStart(2, "0");
  return `${y}.${m}.${day}`;
}

/** 요일 한글 표기 (0=일 … 6=토) */
const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"] as const;

/** 편성표 발행일 파츠 — 신문 발행일 감(월/연 소형캡 + 큰 일자 + 요일). KST 기준. */
export interface EpisodeDateParts {
  /** "2026.07" — 소형캡 상단 표기 */
  monthLabel: string;
  /** "5" — 세리프 큰 일자 */
  day: string;
  /** "금요일" — 요일 */
  weekday: string;
}

/** ISO → 편성표 날짜 파츠. 무효/없음이면 null. */
export function formatEpisodeDateParts(
  iso: string | null | undefined,
): EpisodeDateParts | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = (kst.getUTCMonth() + 1).toString().padStart(2, "0");
  const day = kst.getUTCDate().toString();
  const weekday = WEEKDAY_KO[kst.getUTCDay()];
  return { monthLabel: `${y}.${m}`, day, weekday: `${weekday}요일` };
}

/** 플레이어 시계 표기 — 0/무효는 "0:00" (formatDuration 과 달리 항상 숫자 표기) */
export function formatPlayerTime(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** 초 → "N분 N초" (이어 듣기 안내용). 0 이하/무효는 null. */
export function formatKoreanClock(
  sec: number | null | undefined,
): string | null {
  if (sec == null || !Number.isFinite(sec) || sec <= 0) return null;
  const total = Math.floor(sec);
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m > 0 && s > 0) return `${m}분 ${s}초`;
  if (m > 0) return `${m}분`;
  return `${s}초`;
}

/** publishedAt 이 지금으로부터 72시간(NEW 유효기간) 이내인지 — 렌더 시점 기준 계산 */
export function isWithin72Hours(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  const HOURS_72_MS = 72 * 60 * 60 * 1000;
  const diff = Date.now() - t;
  return diff >= 0 && diff <= HOURS_72_MS;
}

/** 배속 표기 — 정수는 "1.0", 소수는 그대로 ("0.75"/"1.25"/"1.5") */
export function formatPlaybackRate(rate: number): string {
  return Number.isInteger(rate) ? rate.toFixed(1) : rate.toString();
}

/** 초 → "N분" (목록 메타 "N분 · 날짜" 용). 1분 미만은 올림해 "1분", 무효는 null. */
export function formatMinutes(sec: number | null | undefined): string | null {
  if (sec == null || !Number.isFinite(sec) || sec <= 0) return null;
  return `${Math.max(1, Math.round(sec / 60))}분`;
}
