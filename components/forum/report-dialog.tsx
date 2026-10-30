"use client";

// ============================================================================
// components/forum/report-dialog — 신고 다이얼로그 (사유 라디오 4종 + 접수 토스트)
//
// IP 기반 신고. 사유: 욕설/스팸/허위정보/기타. 접수 후 토스트로 안내하고,
// 누적 5회로 자동 가려지면 별도 안내한다. 게시글·댓글 공용.
// 트리거는 밑줄 활자, 사유 목록은 괘선 행(색 면 없음). 로직·API 불변.
// ============================================================================

import { useState } from "react";
import type { ReportReason } from "@/lib/forum/schema";
import "@/app/forum.css";
import { toast } from "@/components/ui/sonner";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ForumApiError,
  reportComment,
  reportPost,
} from "./client-api";

const REASON_OPTIONS: { value: ReportReason; label: string }[] = [
  { value: "abuse", label: "욕설·비방" },
  { value: "spam", label: "스팸·광고" },
  { value: "misinfo", label: "허위 정보" },
  { value: "etc", label: "기타" },
];

interface ReportDialogProps {
  postId: string;
  /** 댓글 신고면 지정 */
  commentId?: string;
  /** 대상 표현 (예: "게시글" | "댓글") — 안내 문구용 */
  targetLabel: string;
}

export function ReportDialog({ postId, commentId, targetLabel }: ReportDialogProps) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason>("abuse");
  const [submitting, setSubmitting] = useState(false);

  function handleTrigger() {
    setReason("abuse");
    setOpen(true);
  }

  async function handleSubmit() {
    setSubmitting(true);
    try {
      const result = commentId
        ? await reportComment(postId, commentId, reason)
        : await reportPost(postId, reason);
      setOpen(false);
      if (result.flagged) {
        toast("신고가 접수되었습니다", {
          description: "신고 누적으로 자동 검토 대기 상태가 되었습니다.",
        });
      } else {
        toast("신고가 접수되었습니다", {
          description: "운영진이 검토 후 조치합니다.",
        });
      }
    } catch (err) {
      toast(
        err instanceof ForumApiError
          ? err.message
          : "신고 처리 중 오류가 발생했습니다.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleTrigger}
        aria-label={`${targetLabel} 신고`}
        className="fo-textbtn"
      >
        신고
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        {/* 포털로 body 에 붙으므로 토큰 스코프(.forum)를 다시 건다(forum.css) */}
        <DialogContent className="forum">
          <DialogHeader>
            <DialogTitle>{targetLabel} 신고</DialogTitle>
            <DialogDescription>
              신고 사유를 선택해 주세요. 접수된 내용은 운영진이 검토합니다.
            </DialogDescription>
          </DialogHeader>

          <fieldset className="m-0 border-0 p-0">
            <legend className="sr-only">신고 사유</legend>
            {REASON_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className={reason === opt.value ? "fo-reason on" : "fo-reason"}
              >
                <input
                  type="radio"
                  name="report-reason"
                  value={opt.value}
                  checked={reason === opt.value}
                  onChange={() => setReason(opt.value)}
                />
                <span>{opt.label}</span>
              </label>
            ))}
          </fieldset>

          <DialogFooter>
            <DialogClose asChild>
              <button type="button" className="fo-textbtn" disabled={submitting}>
                취소
              </button>
            </DialogClose>
            <button
              type="button"
              className="fo-textbtn fo-xlink"
              onClick={handleSubmit}
              disabled={submitting}
              aria-busy={submitting}
            >
              {submitting ? "접수 중…" : "신고 접수"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
