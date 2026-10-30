// ============================================================================
// components/crossview/marker — 광역/기초 마커 (색은 이 6px 도형에만)
//
//   macro: ⋯ 보라 #6706d3 점 3개(6px) — 광역 · MBC충북
//   micro: ▬ 분홍 #e66bd2 괘선 토막(18×3px) — 기초 · 옥천신문
// 도형은 장식(aria-hidden). 매체는 항상 활자 라벨로 병기한다(색 의존 0).
// 고대비 모드에서는 CSS 가 마커를 잉크화한다. 스타일: app/crossview.css(.cvp-mk)
// ============================================================================

export type MarkerSide = "macro" | "micro";

/** 매체 라벨 — 마커 옆에 항상 병기 */
export const OUTLET: Record<MarkerSide, string> = {
  macro: "MBC충북",
  micro: "옥천신문",
};

/** 매체 범위 라벨(스크린리더용 접두) */
export const TIER: Record<MarkerSide, string> = {
  macro: "광역",
  micro: "기초",
};

export function Marker({ side }: { side: MarkerSide }) {
  return side === "macro" ? (
    <span className="cvp-mk macro" aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  ) : (
    <span className="cvp-mk micro" aria-hidden="true">
      <i />
    </span>
  );
}
