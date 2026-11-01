// ============================================================================
// components/crossview/crossview-skeleton — 목록 로딩 = 점선 괘선 행 (FR-CV-07)
//
// 「일점 지면」 로딩 어휘: 괘선이 점선으로 그려지고 데이터가 도착하면 실선 행으로
// 대체된다. 스켈레톤 시머·회색 블록 없음. 행 골격(광역 · 기초 두 줄)만
// 점선으로 잡아 레이아웃 이동을 막는다. 스타일: app/crossview.css(.cvp-row.pending)
// ============================================================================

import { cn } from "@/lib/utils";
import "@/app/crossview.css";

/** 점선 괘선 행 한 개 (crossview-card 와 동일 골격) */
export function CrossviewCardSkeleton({ className }: { className?: string }) {
  return (
    <li className={cn("cvp-row pending", className)} aria-hidden="true">
      <div className="cvp-row-link">
        <span className="cvp-col macro">
          <span className="cvp-pending-line short" />
          <span className="cvp-pending-line" />
        </span>
        <span className="cvp-col micro">
          <span className="cvp-pending-line short" />
          <span className="cvp-pending-line" />
        </span>
      </div>
    </li>
  );
}

/** 점선 괘선 행 목록 — 페이지 로딩(loading.tsx)용 */
export function CrossviewListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <ol className="cvp-rows" aria-busy="true" aria-label="크로스뷰 목록 불러오는 중">
      {Array.from({ length: count }).map((_, i) => (
        <CrossviewCardSkeleton key={i} />
      ))}
    </ol>
  );
}
