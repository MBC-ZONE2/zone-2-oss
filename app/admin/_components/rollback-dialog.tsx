"use client";

// ============================================================================
// app/admin/_components/rollback-dialog — 발행 콘텐츠 롤백 확인
//
// 출처: REQ(F7) — 콘텐츠 관리 롤백 (이슈 #34)
//
// 발행됨 → 검수 되돌리기. 사유 필수(입력 없으면 실행 비활성).
// ============================================================================

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FIELD_CLASS, type ContentItem } from "./lib";

export function RollbackDialog({
  item,
  open,
  onOpenChange,
  onConfirm,
  pending,
}: {
  item: ContentItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => void;
  pending: boolean;
}) {
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (open) setReason("");
  }, [open, item]);

  if (!item) return null;
  const disabled = pending || reason.trim().length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>발행 되돌리기</DialogTitle>
          <DialogDescription>
            &ldquo;{item.title}&rdquo; 을(를) 검수 상태로 되돌립니다. 공개
            노출이 중단되며, 사유는 감사 로그에 기록됩니다.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="rollback-reason" className="text-sm font-medium">
            롤백 사유 <span className="text-danger">*</span>
          </label>
          <textarea
            id="rollback-reason"
            value={reason}
            rows={3}
            onChange={(e) => setReason(e.target.value)}
            placeholder="되돌리는 이유를 입력하세요."
            className={`${FIELD_CLASS} resize-y`}
          />
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" className="min-h-11">
              취소
            </Button>
          </DialogClose>
          <Button
            className="min-h-11 bg-danger text-brand-foreground hover:bg-danger/90"
            disabled={disabled}
            onClick={() => onConfirm(reason.trim())}
          >
            {pending ? "처리 중…" : "검수로 되돌리기"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
