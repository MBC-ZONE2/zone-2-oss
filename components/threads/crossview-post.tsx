// ============================================================================
// components/threads/crossview-post — 크로스뷰 목록 행(호환 래퍼)
//
// 「일점 지면」에서 목록 항목은 카드가 아니라 괘선 행(components/crossview/
// crossview-card 의 CrossviewCard = <li>)이다. 이 파일은 기존 이름(CrossviewPost)
// 을 유지하기 위한 얇은 래퍼 — <ol class="cvp-rows"> 안에서 쓴다.
// 데이터는 실 크로스뷰 페어(CrossviewPairWithArticles) + 온도 보드.
// ============================================================================

import type { CrossviewPairWithArticles } from "@/lib/matching";
import type { TemperatureBoardItem } from "@/types";
import { CrossviewCard } from "@/components/crossview/crossview-card";

export function CrossviewPost({
  pair,
  temperature,
}: {
  pair: CrossviewPairWithArticles;
  /** 공론 온도 보드(실 산출). 없으면 온도 미매칭(점선 괘선) */
  temperature?: TemperatureBoardItem[];
}) {
  return <CrossviewCard pair={pair} temperature={temperature} />;
}
