"use client";

// ============================================================================
// components/home/reveal — 섹션 스크롤 리빌 래퍼 (디자인 v2.1 · B2)
//
// 서버 컴포넌트 children 을 그대로 감싸는 얇은 클라이언트 래퍼. 뷰포트 진입 시
// fade + translate-y(8px) 320ms 를 1회 재생한다(IntersectionObserver, 진입 후 관찰
// 해제). 홈 섹션 3곳에만 사용한다(과용 금지).
//
// 접근성/견고성:
//   - prefers-reduced-motion 또는 IntersectionObserver 미지원 → 즉시 표시(모션 없음)
//   - JS 미동작(no-JS/하이드레이션 실패) → 숨김을 "무장(armed)"하지 않으므로 항상 표시
//   - motion-safe: 변형/트랜지션이라 reduce 설정 시 CSS 레벨에서도 이중 차단
// ============================================================================

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { usePrefersReducedMotion } from "./hooks";

interface RevealProps {
  children: React.ReactNode;
  className?: string;
}

/** 뷰포트 진입 시 1회 fade+translate 로 드러나는 얇은 래퍼 */
export function Reveal({ children, className }: RevealProps) {
  const reduced = usePrefersReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  // armed: 마운트 후 JS 로 초기 숨김을 활성화. no-JS 에서는 false → 항상 표시.
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (reduced || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const el = ref.current;
    if (!el) return;
    setArmed(true);
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setInView(true);
            io.disconnect();
            break;
          }
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.05 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reduced]);

  const hidden = armed && !inView;

  return (
    <div
      ref={ref}
      className={cn(
        "motion-safe:transition-all motion-safe:duration-[320ms] motion-safe:ease-out",
        hidden ? "opacity-0 translate-y-2" : "opacity-100 translate-y-0",
        className,
      )}
    >
      {children}
    </div>
  );
}
