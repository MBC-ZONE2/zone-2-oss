"use client";

// 글·댓글 수정 액션. 누구에게나 노출하며 작성 시 정한 비밀번호는 서버에서 검증한다.
// 시각: 밑줄 활자 트리거 + 괘선 상하 인라인 폼. 글 수정에 성공하면(소유 증명)
// 내 글 목록(localStorage)에 기록해 잉크 점을 앉힌다.

import { useId, useState } from "react";
import type { ForumComment, ForumPost } from "@/types";
import { toast } from "@/components/ui/sonner";
import { ForumApiError, updateComment, updatePost } from "./client-api";
import { rememberMyPost } from "./my-posts";

interface EditButtonProps {
  postId: string;
  commentId?: string;
  targetLabel: string;
  initialTitle?: string | null;
  initialBody: string;
  /** 제목 칸 노출 — 사안 댓글(article_id 있음)은 작성기에 제목이 없으므로 수정에서도 숨긴다 */
  allowTitle?: boolean;
  onEdited: (updated: ForumPost | ForumComment) => void;
}

export function EditButton({
  postId,
  commentId,
  targetLabel,
  initialTitle = null,
  initialBody,
  allowTitle = true,
  onEdited,
}: EditButtonProps) {
  const fieldId = useId();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(initialTitle ?? "");
  const [body, setBody] = useState(initialBody);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function toggle() {
    if (!open) {
      setTitle(initialTitle ?? "");
      setBody(initialBody);
      setPassword("");
      setError(null);
    }
    setOpen((value) => !value);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedBody = body.trim();
    const bodyMin = commentId ? 1 : 5;
    const bodyMax = commentId ? 200 : 5000;

    if (trimmedBody.length < bodyMin || trimmedBody.length > bodyMax) {
      setError(
        commentId
          ? `댓글은 1~${bodyMax}자로 입력해 주세요`
          : `내용은 ${bodyMin}~${bodyMax.toLocaleString()}자로 입력해 주세요`,
      );
      return;
    }
    if (!commentId && title.trim().length > 120) {
      setError("제목은 120자 이하여야 합니다");
      return;
    }
    if (password.length < 4) {
      setError("비밀번호는 4자 이상이어야 합니다");
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      const updated = commentId
        ? await updateComment(postId, commentId, {
            body: trimmedBody,
            password,
          })
        : await updatePost(postId, {
            title: title.trim() || null,
            body: trimmedBody,
            password,
          });
      if (!commentId) rememberMyPost(postId);
      onEdited(updated);
      setOpen(false);
      setPassword("");
      toast(`${targetLabel}이 수정되었습니다`);
    } catch (err) {
      setError(
        err instanceof ForumApiError
          ? err.message
          : "수정 중 오류가 발생했습니다.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="fo-textbtn"
      >
        수정
      </button>

      {open && (
        <form onSubmit={handleSubmit} className="fo-inline" noValidate>
          {!commentId && allowTitle && (
            <div className="fo-field">
              <label htmlFor={`${fieldId}-title`} className="fo-label">
                제목 <small>(선택)</small>
              </label>
              <input
                id={`${fieldId}-title`}
                value={title}
                maxLength={120}
                onChange={(event) => setTitle(event.target.value)}
                className="fo-input"
              />
            </div>
          )}
          <div className="fo-field">
            <label htmlFor={`${fieldId}-body`} className="fo-label">
              {commentId ? "댓글" : "내용"}
            </label>
            <textarea
              id={`${fieldId}-body`}
              value={body}
              rows={commentId ? 3 : 5}
              maxLength={commentId ? 200 : 5000}
              onChange={(event) => setBody(event.target.value)}
              className="fo-textarea"
            />
          </div>
          <div className="fo-field">
            <label htmlFor={`${fieldId}-password`} className="fo-label">
              작성 비밀번호
            </label>
            <input
              id={`${fieldId}-password`}
              type="password"
              value={password}
              minLength={4}
              maxLength={128}
              autoComplete="current-password"
              onChange={(event) => setPassword(event.target.value)}
              placeholder="4자 이상"
              aria-invalid={Boolean(error)}
              className="fo-input"
            />
          </div>
          {error && (
            <p role="alert" className="fo-err">
              {error}
            </p>
          )}
          <div className="fo-inline-actions">
            <button type="button" className="fo-textbtn" onClick={toggle}>
              취소
            </button>
            <button
              type="submit"
              className="fo-textbtn fo-xlink"
              disabled={submitting}
              aria-busy={submitting}
            >
              {submitting ? "저장 중…" : "저장"}
            </button>
          </div>
        </form>
      )}
    </>
  );
}
