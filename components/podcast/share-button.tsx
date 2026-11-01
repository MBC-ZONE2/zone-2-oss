"use client";

// ============================================================================
// components/podcast/share-button — 에피소드 공유 (FR-PC-04)
//
// Web Share API 지원 시 네이티브 공유 시트, 미지원 시 현재 URL 을 클립보드에
// 복사하고 "복사됨" 피드백을 잠시 노출한다. 밑줄 활자 버튼(44px, 면 없음).
// ============================================================================

import { useEffect, useRef, useState } from "react";

export interface ShareButtonProps {
  title: string;
}

/** 공유 버튼 — 네이티브 공유 or 링크 복사 */
export function ShareButton({ title }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const flashCopied = () => {
    setCopied(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    if (typeof window === "undefined") return;
    const url = window.location.href;
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        // 사용자 취소/실패 — 복사 폴백으로 진행
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      flashCopied();
    } catch {
      // 복사 실패는 조용히 무시
    }
  };

  return (
    <button type="button" className="pc-tlink" onClick={handleShare} aria-live="polite">
      {copied ? "복사됨" : "공유"}
    </button>
  );
}
