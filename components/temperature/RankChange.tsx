"use client";

// ============================================================================
// components/temperature/RankChange — 순위 변동 활자 (FR-TH-02)
//
// prevRank 대비 현재 rank 변동을 활자로만 표시한다(색 의존 없음).
//   상승(rank 숫자 ↓)= "▲n" 백색 700, 하락 = "▼n" 회색, 동일 = "–", 신규 = "NEW".
// 등장 애니메이션 없음 — 지면은 움직이지 않는다(reduced 는 호환용 인자로 유지).
// 스타일: app/temperature.css(.tw-rank)
// ============================================================================

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface RankChangeProps {
  rank: number | null;
  prevRank: number | null;
  /** (호환) 모션 최소화 — 활자 표기에는 영향 없음 */
  reduced?: boolean;
}

interface ChangeView {
  label: string;
  className: string;
  node: ReactNode;
}

/** rank/prevRank → 표시 정보(라벨·클래스·노드) 계산. */
function describeChange(rank: number | null, prevRank: number | null): ChangeView {
  if (rank != null && prevRank == null) {
    return { label: "신규 진입", className: "is-new", node: "NEW" };
  }
  if (rank == null || prevRank == null) {
    return { label: "순위 변동 없음", className: "", node: <span aria-hidden>–</span> };
  }
  // rank 가 작을수록 상위. prevRank - rank > 0 이면 순위 상승.
  const delta = prevRank - rank;
  if (delta === 0) {
    return { label: "순위 변동 없음", className: "", node: <span aria-hidden>–</span> };
  }
  const up = delta > 0;
  return {
    label: up ? `${delta}계단 상승` : `${Math.abs(delta)}계단 하락`,
    className: up ? "is-up" : "is-down",
    node: (
      <>
        <span aria-hidden>{up ? "▲" : "▼"}</span>
        {Math.abs(delta)}
      </>
    ),
  };
}

/** 순위 변동 표시(활자). */
export function RankChange({ rank, prevRank }: RankChangeProps) {
  const view = describeChange(rank, prevRank);
  return (
    <span aria-label={view.label} className={cn("tw-rank", view.className)}>
      {view.node}
    </span>
  );
}
