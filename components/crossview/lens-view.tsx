// ============================================================================
// components/crossview/lens-view — 두 칼럼 대비 지면 (FR-CD-02)
//
// 「일점 지면」: 탭·스와이프 없이 두 칼럼을 동시에 찍는다.
//   ≥640px: 좌 '광역이 본 것' ⋯ [송신탑]MBC충북 | 세로 괘선 | 우 '기초가 본 것' ▬ [종이신문]옥천신문
//   폰:     상(광역) → 괘선 → 하(기초)
// 출처 줄의 매체 아이콘(<MediaIcon>)과 제목 굵기(양쪽 700 동일)는 각 칼럼(article-panel)이 찍는다.
// 시그니처: 양쪽 keywords 교집합 낱말만 잉크 700(keywords prop, 페이지가 계산).
// 서버 컴포넌트. 스타일: app/crossview.css(.cvp-cols). .dk-read = 데스크탑 활자 폭 상한(760px, app/reels.css)
// ============================================================================

import type { Article } from "@/types";
import { ArticlePanel } from "./article-panel";
import "@/app/crossview.css";

export interface LensViewProps {
  macro: Article | null;
  micro: Article | null;
  summaryMacro: string | null;
  summaryMicro: string | null;
  /** 양쪽 articles.keywords 교집합(keywordIntersection). 없으면 강조 없음 */
  keywords?: readonly string[];
}

/** 두 칼럼 대비 지면 */
export function LensView({
  macro,
  micro,
  summaryMacro,
  summaryMicro,
  keywords = [],
}: LensViewProps) {
  return (
    <div className="cvp-cols dk-read" role="group" aria-label="광역·기초 보도 비교">
      <ArticlePanel article={macro} summary={summaryMacro} accent="macro" keywords={keywords} />
      <ArticlePanel article={micro} summary={summaryMicro} accent="micro" keywords={keywords} />
    </div>
  );
}
