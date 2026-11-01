// ============================================================================
// lib/matching/card — 카드뉴스(card_data) 구성
//
// deliverables/01 §5: 하단 카드뉴스 = 3컷 카드(공유·다운로드), 1080×1350.
// crossview_pairs.card_data(jsonb)에 저장할 구조를 만든다.
// 구조는 그룹 A(크로스뷰)에서 확정한다 (types/index.ts CrossviewCardData는 open shape).
// ============================================================================

import type { Article, CrossviewCardData } from "@/types";
import { outletBySource, region } from "@/config/region";

/** 카드뉴스 1컷 */
export interface CardSlide {
  /** 컷 종류: 표지 / 광역 / 기초 / 대비포인트 */
  kind: "cover" | "macro" | "micro" | "point";
  title: string;
  body: string;
  /** 출처 라벨 (예: "MBC충북", "옥천신문") — 표지/포인트 컷은 생략 */
  sourceLabel?: string;
}

/** card_data(jsonb) 실제 구조 — CrossviewCardData(open shape)에 호환 */
export interface CrossviewCardPayload extends CrossviewCardData {
  /** 카드 규격 */
  width: number;
  height: number;
  /** 헤드라인(표지 큰 글씨) */
  headline: string;
  /** 3컷 슬라이드 */
  slides: CardSlide[];
  /** 출처 표기 */
  attribution: { macro: string; micro: string };
}

/** 매체 라벨 (source enum → 표기) */
export function sourceLabel(source: Article["source"]): string {
  return outletBySource(source)?.name ?? region.outlets.micro.name;
}

/** 긴 본문을 카드용으로 잘라낸다 (말줄임). */
function truncate(text: string, max = 120): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1).trimEnd()}…`;
}

/**
 * 광역/기초 기사 + AI 요약으로 3컷 카드뉴스 데이터를 만든다.
 *  - 1컷: 표지(리딩 포인트 헤드라인)
 *  - 2컷: 광역 관점 요약
 *  - 3컷: 기초 관점 요약
 */
export function buildCardData(input: {
  macro: Article;
  micro: Article;
  summaryMacro: string;
  summaryMicro: string;
  readingPoint: string;
}): CrossviewCardPayload {
  const { macro, micro, summaryMacro, summaryMicro, readingPoint } = input;

  const macroLabel = sourceLabel(macro.source);
  const microLabel = sourceLabel(micro.source);

  const slides: CardSlide[] = [
    {
      kind: "cover",
      title: "같은 정책, 두 개의 현실",
      body: truncate(readingPoint, 90),
    },
    {
      kind: "macro",
      title: truncate(macro.title, 60),
      body: truncate(summaryMacro),
      sourceLabel: macroLabel,
    },
    {
      kind: "micro",
      title: truncate(micro.title, 60),
      body: truncate(summaryMicro),
      sourceLabel: microLabel,
    },
  ];

  return {
    width: 1080,
    height: 1350,
    headline: "같은 정책, 두 개의 현실",
    slides,
    attribution: { macro: macroLabel, micro: microLabel },
  };
}
