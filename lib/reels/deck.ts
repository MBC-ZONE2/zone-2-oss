// ============================================================================
// lib/reels/deck — 릴스형 세로 스냅 덱의 순수 로직 (서버/클라 공용)
//
// 베타(beta-web/lib/db.js)의 buildDeck·crossviewTemp·bandFor·crossviewTitle 을
// 실앱 도메인 타입 위로 이식한 순수 함수 모음이다. 데이터는 전부 인자로 주입받고
// (스냅샷/더미 import 금지), 온도 밴드는 코어 SSOT(lib/temperature/formula)를 재사용한다.
// ============================================================================

import type { CrossviewPairWithArticles, CardSlide } from "@/lib/matching";
import type { Episode, ForumPost, TemperatureBoardItem } from "@/types";
// 타입만 가져온다(런타임 import 없음 — action-layer 는 서버 전용 모듈)
import type { DeadlineItem } from "@/components/home/action-layer";
import {
  TEMPERATURE_BANDS,
  bandForTemperature,
  type TemperatureBand,
} from "@/lib/temperature/formula";
import { region } from "@/config/region";

export { TEMPERATURE_BANDS };
export type { TemperatureBand };

/** 온도값 → 5구간 밴드 (코어 SSOT 재사용) */
export function bandFor(t: number | null | undefined): TemperatureBand {
  return bandForTemperature(Number(t) || 0);
}

/** 옥천군청 공고 1건 (articles source=oc_gov, category=공고) */
export interface NoticeItem {
  id: string;
  title: string;
  url: string | null;
  dept: string | null;
  notno: string | null;
  publishedAt: string | null;
}

/** ReelsDeck 에 주입되는 실 데이터 묶음 (전부 실 Supabase 조회 결과) */
export interface ReelsData {
  episodes: Episode[];
  temperature: TemperatureBoardItem[];
  temperatureComputedAt: string | null;
  crossview: CrossviewPairWithArticles[];
  notices: NoticeItem[];
  forum: ForumPost[];
  /** 놓치면 손해 마감(임박 순, daysLeft 는 서버에서 KST 기준 계산됨). 없으면 공고 띠는 건수 표기 */
  deadlines?: DeadlineItem[];
  /**
   * 승인 크로스뷰 전체 쌍 수(끝 슬라이드 "전체 N쌍 보기" 표기용).
   * crossview 배열은 홈용으로 잘려 오므로 개수를 총계로 쓸 수 없다 —
   * 서버가 별도 count 로 넣어 주면 N 을 쓰고, 없으면 숫자 없이 "전체 보기"만 쓴다.
   */
  crossviewTotal?: number;
}

/** 덱 슬라이드 1장 = DB 항목 1개 (맨 앞 "cover" 는 인트로를 잇는 표지) */
export type DeckSlide =
  | { kind: "cover" }
  | { kind: "podcast"; ep: Episode }
  | { kind: "temperature" }
  | { kind: "crossview"; item: CrossviewPairWithArticles }
  | { kind: "crossview-cards"; item: CrossviewPairWithArticles }
  | { kind: "notices" }
  | { kind: "forum" }
  | { kind: "end" };

export type DeckKind = DeckSlide["kind"];

export const KIND_LABEL: Record<DeckKind, string> = {
  cover: "표지",
  podcast: "오디오 브리핑",
  temperature: "공론 온도",
  crossview: "크로스뷰",
  "crossview-cards": "크로스뷰", // "· 카드 스토리" 는 폰(375px)에서 가운데 로고와 겹쳐 뺐다(2026-10-26 대표 지시)
  notices: region.government.noticesLabel,
  forum: "여론광장",
  end: "끝",
};

// ── 텍스트 유틸 ─────────────────────────────────────────────────────────────
const clean = (t: string | null | undefined): string =>
  String(t || "")
    .replace(/^R\)\s*/, "")
    .replace(/^[◀▷▶].*?▶\s*/s, "")
    .replace(/\s+/g, " ")
    .trim();

const isGeneric = (t: string): boolean => !t || /지면\s*보기|^\d+\s*호(\s|$)/.test(t);

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 크로스뷰 표시 제목 — 기초→광역→카드 헤드라인 순으로 유효한 첫 제목 */
export function crossviewTitle(item: CrossviewPairWithArticles): string {
  const micro = clean(item?.micro?.title);
  const macro = clean(item?.macro?.title);
  const head = clean((item?.cardData?.headline as string | undefined) ?? "");
  if (!isGeneric(micro)) return micro;
  if (!isGeneric(macro)) return macro;
  return head || `${region.place.name} 소식`;
}

/** 크로스뷰의 card_data.slides 를 안전하게 CardSlide[] 로 읽는다 */
export function cardSlidesOf(item: CrossviewPairWithArticles): CardSlide[] {
  const slides = item?.cardData?.slides as CardSlide[] | undefined;
  return Array.isArray(slides) ? slides : [];
}

/** 크로스뷰 스크립트(대본이 아니라 요약/리딩)에서 온도 매칭용 건초더미 */
function crossviewHaystack(item: CrossviewPairWithArticles): string {
  return [
    item?.readingPoint,
    item?.macro?.title,
    item?.micro?.title,
    item?.summaryMacro,
    item?.summaryMicro,
  ]
    .map((s) => String(s || ""))
    .join(" ");
}

/**
 * 크로스뷰 ↔ 이슈 온도 근사 연결(B안). 크로스뷰 텍스트에 이슈 라벨/키워드가
 * 있으면 그 이슈의 실 산출 온도를 반환, 없으면 null("여론 수집 중").
 */
export function crossviewTemp(
  item: CrossviewPairWithArticles,
  temperature: TemperatureBoardItem[],
): { temperature: number; band: TemperatureBand; issueLabel: string | null } | null {
  const hay = crossviewHaystack(item);
  let best: TemperatureBoardItem | null = null;
  for (const it of temperature) {
    const terms = [it?.issue?.label, ...(it?.issue?.keywords || [])].filter(
      (k): k is string => !!k && String(k).length >= 2,
    );
    if (
      terms.some((k) => hay.includes(k)) &&
      (!best || (it.rank ?? 99) < (best.rank ?? 99))
    ) {
      best = it;
    }
  }
  if (!best) return null;
  return {
    temperature: best.temperature,
    band: bandFor(best.temperature),
    issueLabel: best.issue?.label || null,
  };
}

/** 피드 카드 ↔ 온도 이슈 매칭 (TempChip 확장 패널용 — 행 전체를 반환) */
export function tempForItem(
  item: CrossviewPairWithArticles,
  temperature: TemperatureBoardItem[],
): { row: TemperatureBoardItem; band: TemperatureBand } | null {
  const hay = crossviewHaystack(item);
  for (const row of temperature) {
    const keys = [row.issue?.label, ...(row.issue?.keywords || [])].filter(
      (k): k is string => !!k && k.length >= 2,
    );
    if (keys.some((k) => hay.includes(k))) {
      return { row, band: bandFor(row.temperature) };
    }
  }
  return null;
}

/** 오디오 소스 — 절대 URL 이면 그대로, 아니면 서버 스트리밍 라우트 */
export function audioSrc(ep: Episode): string {
  const u = ep?.audioUrl || "";
  if (/^https?:\/\//.test(u)) return u;
  return `/api/podcast/${ep.id}/audio`;
}

/** 대본을 줄 단위로 잘라 반환 */
export function scriptLines(ep: Episode, max = Infinity): string[] {
  return String(ep?.script || "")
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, max);
}

/**
 * 홈 덱에 싣는 크로스뷰 최대 장수. 24장이 한 줄로 이어지면 끝이 안 보여
 * 읽다 지친다는 지적(2026-09-10)에 따라 최근 8장으로 끊고, 나머지는 /crossview 목록에서 본다.
 */
export const HOME_CROSSVIEW_LIMIT = 8;

/**
 * 릴스형 피드 덱 구성 — 슬라이드 1장 = 항목 1개.
 * 순서: 표지 → 오늘의 충북(팟캐스트) → 온도 → 크로스뷰 최근 8장 → 공고 → 여론광장 → end.
 * 섹션 하나당 노출 개수를 묶어 "한 화면 안에 끝이 보이는" 길이(최대 13장)로 고정한다.
 * 표지(cover)는 데이터와 무관하게 항상 0번 — 인트로 종료 프레임을 물려받는 자리다.
 * 페어 1개 = 슬라이드 1장(중복 없음): card_data.slides ≥ 3장이면 4페이지 카드 스토리
 * ("crossview-cards") 하나만 넣고, 그 페어의 일반 "crossview" 슬라이드는 넣지 않는다.
 * 카드가 3장 미만인 페어만 일반 크로스뷰 슬라이드로 간다.
 * 데스크톱 보드(DesktopBoard)는 이 덱을 쓰지 않으므로 영향이 없다.
 */
export function buildDeck(data: ReelsData): DeckSlide[] {
  const deck: DeckSlide[] = [];
  const { episodes, temperature, crossview, notices, forum } = data;

  deck.push({ kind: "cover" });
  if (episodes[0]) deck.push({ kind: "podcast", ep: episodes[0] });
  if (temperature.length) deck.push({ kind: "temperature" });

  // 같은 페어가 두 번 들어가지 않도록 id 로 한 번 더 막는다(입력 목록 중복 방어)
  const seen = new Set<string>();
  const cv = crossview.filter((item) => {
    const id = String(item?.id ?? "");
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  const pushCv = (item: CrossviewPairWithArticles) => {
    if (cardSlidesOf(item).length >= 3) deck.push({ kind: "crossview-cards", item });
    else deck.push({ kind: "crossview", item });
  };

  // 최근 8장까지만 — 입력은 최신순(created_at desc)이므로 앞에서 잘라 쓴다
  cv.slice(0, HOME_CROSSVIEW_LIMIT).forEach(pushCv);
  if (notices.length) deck.push({ kind: "notices" });
  if (forum.length) deck.push({ kind: "forum" });
  deck.push({ kind: "end" });

  return deck;
}

/** 덱에 실제로 실린 크로스뷰 장수(끝 슬라이드 안내 문구용 — 중복 제거 뒤 실수치) */
export function countCrossviewSlides(deck: DeckSlide[]): number {
  return deck.filter((s) => s.kind === "crossview" || s.kind === "crossview-cards").length;
}
