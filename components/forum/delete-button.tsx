"use client";

// ============================================================================
// components/forum/delete-button — 비밀번호 확인 후 글/댓글 소프트 삭제
//
// 액션 아래 괘선 상하 인라인 확인 폼을 열고 비밀번호를 서버에서 검증한다.
// 트리거는 밑줄 활자(.fo-textbtn). 로직·API 불변.
// ============================================================================

import { useState } from "react";
import { toast } from "@/components/ui/sonner";
import { deleteComment, deletePost, ForumApiError } from "./client-api";

interface DeleteButtonProps {
  postId: string;
  /** 댓글 삭제면 지정 */
  commentId?: string;
  targetLabel: string;
  /** 삭제 성공 후 (자리표시자 전환) */
  onDeleted: () => void;
}

export function DeleteButton({
  postId,
  commentId,
  targetLabel,
  onDeleted,
}: DeleteButtonProps) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function close() {
    setOpen(false);
    setPassword("");
    setError(null);
  }

  async function handleConfirm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password.length < 4) {
      setError("비밀번호는 4자 이상이어야 합니다");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      if (commentId) {
        await deleteComment(postId, commentId, password);
      } else {
        await deletePost(postId, password);
      }
      close();
      onDeleted();
      toast(`${targetLabel}이 삭제되었습니다`);
    } catch (err) {
      setError(
        err instanceof ForumApiError
          ? err.message
          : "삭제 중 오류가 발생했습니다.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-label={`${targetLabel} 삭제`}
        aria-expanded={open}
        className="fo-textbtn"
      >
        삭제
      </button>

      {open && (
        <form onSubmit={handleConfirm} className="fo-inline" noValidate>
          <p className="q">{targetLabel}을 삭제할까요?</p>
          <p className="note">
            삭제하면 되돌릴 수 없습니다. 작성할 때 정한 비밀번호를 입력해 주세요.
          </p>
          <input
            type="password"
            value={password}
            minLength={4}
            maxLength={128}
            autoComplete="current-password"
            onChange={(event) => setPassword(event.target.value)}
            placeholder="비밀번호 4자 이상"
            aria-label={`${targetLabel} 작성 비밀번호`}
            aria-invalid={Boolean(error)}
            className="fo-input"
          />
          {error && (
            <p role="alert" className="fo-err">
              {error}
            </p>
          )}
          <div className="fo-inline-actions">
            <button
              type="button"
              className="fo-textbtn"
              disabled={submitting}
              onClick={close}
            >
              취소
            </button>
            <button
              type="submit"
              className="fo-textbtn fo-xlink"
              disabled={submitting}
              aria-busy={submitting}
            >
              {submitting ? "삭제 중…" : "삭제"}
            </button>
          </div>
        </form>
      )}
    </>
  );
}
