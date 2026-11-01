// ============================================================================
// /crossview — 목록 로딩 = 점선 괘선 (FR-CV-07)
//
// 「일점 지면」 로딩 어휘: 괘선이 점선으로 그려지고 데이터 도착 시 실선으로
// 이어진다. 스켈레톤 시머·회색 블록 없음. 제호·필터 줄·행 6개의 골격만 잡는다.
// ============================================================================

import { CrossviewListSkeleton } from "@/components/crossview";
import "@/app/crossview.css";

export default function CrossviewLoading() {
  return (
    <main className="cvp cvp-list" aria-busy="true">
      <header className="cvp-mast">
        <h1>크로스뷰</h1>
        <span className="sr-only" role="status">불러오는 중</span>
        <span className="cvp-pending-line short" aria-hidden="true" />
      </header>

      {/* 필터 자리 — 점선 괘선 한 줄 */}
      <div className="cvp-filter" aria-hidden="true">
        <span className="cvp-pending-line short" />
      </div>

      <CrossviewListSkeleton count={6} />
    </main>
  );
}
