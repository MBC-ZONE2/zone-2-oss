"use client";

// ============================================================================
// components/home/offline-banner — 오프라인 감지 배너 (FR-H-07)
//
// navigator.onLine + online/offline 이벤트로 연결 상태를 감지한다.
// 오프라인 시 상단에 안내 배너를 띄우고, 재연결 시 배너를 숨기며 서버 데이터를
// 갱신(router.refresh)한다. SSR 초기값은 온라인(배너 없음)으로 두어 hydration
// 불일치를 피한다.
// ============================================================================

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/** 오프라인 안내 배너 (오프라인일 때만 렌더) */
export function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  const router = useRouter();

  useEffect(() => {
    // 마운트 시 현재 상태 동기화 (예: 오프라인으로 진입한 경우)
    setOffline(!navigator.onLine);

    const handleOnline = () => {
      setOffline(false);
      // 재연결 시 서버 렌더 섹션(크로스뷰·팟캐스트)을 최신화
      router.refresh();
    };
    const handleOffline = () => setOffline(true);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [router]);

  if (!offline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-14 z-30 flex items-center justify-center gap-2 border-b border-warning/30 bg-warning-bg px-4 py-2.5 text-center text-sm font-semibold text-warning"
    >
      <svg
        viewBox="0 0 24 24"
        className="h-4 w-4 shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M12 3C7 3 3.5 5 2 6.5M22 6.5c-.7-.7-1.6-1.3-2.5-1.8M5 10c1-.9 2.2-1.6 3.5-2M12 14c.8-.6 1.7-1 2.7-1.2M12 20h.01" />
      </svg>
      인터넷 연결을 확인해 주세요
    </div>
  );
}
