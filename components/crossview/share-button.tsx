// ============================================================================
// components/crossview/share-button — 공유(활자 버튼, FR-CD-07 링크 공유만)
//
// Web Share API 지원 시 시스템 공유 시트, 미지원 시 링크 복사 + "링크 복사됨" 피드백.
// 「일점 지면」: 테두리·면 없는 밑줄 활자(12px, 패딩으로 44px 탭 타깃).
// 본문 끝 한 줄(.cvp-fine) 안에서 쓴다. 스타일: app/crossview.css(.cvp-share)
// ============================================================================

"use client";

import { useEffect, useRef, useState } from "react";

/** 공유 버튼 */
export function ShareButton({
  title,
  text,
}: {
  title: string;
  text?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const handleShare = async () => {
    const url = window.location.href;
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title, text, url });
      } catch {
        // 사용자 취소 등은 무시한다.
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // 클립보드 접근 실패는 무시한다(권한/비보안 컨텍스트).
    }
  };

  return (
    <button
      type="button"
      onClick={handleShare}
      aria-label="이 크로스뷰 공유하기"
      className="cvp-share"
    >
      <span aria-live="polite">{copied ? "링크 복사됨" : "공유"}</span>
    </button>
  );
}
