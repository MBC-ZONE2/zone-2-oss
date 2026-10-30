"use client";

// ============================================================================
// app/admin/_components/queue-bulk-bar — 일괄 처리 띠 (「일점 지면」)
//
// 출처: REQ(F7) — 다중 선택 승인/반려 (이슈 #34)
//
// 목록 위에 붙는(sticky) 한 줄: [전체 선택] N건 선택 (가능 M · 최대 K) …… [선택 승인][선택 반려].
// 선택이 있을 때만 아래 괘선이 2px 로 굵어지고 반려 사유 칸이 나온다.
// 선택 가능한 항목이 없으면(공론장 플래그·금칙어 등 전부 제외) 안내 한 줄만.
// ============================================================================

import { Button } from "@/components/ui/button";

export function BulkBar({
  selectedCount,
  selectableCount,
  maxBulk,
  bulkReason,
  onBulkReasonChange,
  onToggleAll,
  onApprove,
  onReject,
  pending,
}: {
  selectedCount: number;
  selectableCount: number;
  maxBulk: number;
  bulkReason: string;
  onBulkReasonChange: (v: string) => void;
  onToggleAll: () => void;
  onApprove: () => void;
  onReject: () => void;
  pending: boolean;
}) {
  // 선택 가능한 항목이 전혀 없으면 개별 검토 안내만 노출.
  if (selectableCount === 0) {
    return (
      <p className="ad-bulk-none">
        플래그·금칙어 항목은 일괄 처리에서 제외됩니다. 개별 검토로 진행하세요.
      </p>
    );
  }

  const none = selectedCount === 0;
  const rejectDisabled = pending || none || bulkReason.trim().length === 0;
  const allSelected = selectedCount >= Math.min(selectableCount, maxBulk);

  return (
    <div className="ad-bulk" data-active={none ? "false" : "true"}>
      <button type="button" className="ad-textbtn" onClick={onToggleAll}>
        {allSelected ? "선택 해제" : "전체 선택"}
      </button>
      <span className="ad-count">
        <b>{selectedCount}</b>건 선택
        <span style={{ marginLeft: 8, fontSize: 13 }}>
          (가능 {selectableCount} · 최대 {maxBulk})
        </span>
      </span>
      <div className="ad-bulk-r">
        <Button size="sm" disabled={pending || none} onClick={onApprove}>
          {pending ? "처리 중…" : "선택 승인"}
        </Button>
        <button
          type="button"
          className="ad-textbtn is-danger"
          disabled={rejectDisabled}
          onClick={onReject}
          title={!none && bulkReason.trim().length === 0 ? "일괄 반려 사유를 입력하세요" : undefined}
        >
          선택 반려
        </button>
      </div>
      {!none && (
        <input
          value={bulkReason}
          onChange={(e) => onBulkReasonChange(e.target.value)}
          placeholder="일괄 반려 사유 (반려 시 필수 — 감사 로그에 남습니다)"
          aria-label="일괄 반려 사유"
          className="ad-field"
        />
      )}
    </div>
  );
}
