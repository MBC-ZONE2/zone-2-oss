"use client";

// ============================================================================
// components/home/hooks — 홈 라이브 보드 클라이언트 훅 (모션·카운트업)
//
// prefers-reduced-motion 감지와 숫자 카운트업 전환을 제공한다.
// 접근성 1급: 모션 최소화 설정 시 애니메이션 없이 즉시 최종값으로 반영한다.
// SSR 안전을 위해 초기값은 서버/클라이언트가 동일하게 결정되도록 둔다.
// ============================================================================

import { useEffect, useRef, useState } from "react";

/** prefers-reduced-motion: reduce 감지 (SSR 초기값 false → 마운트 후 동기화) */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return reduced;
}

/**
 * target 값으로 duration(ms) 동안 카운트업 전환한다(easeOutQuad).
 * reduced=true 면 애니메이션 없이 즉시 target 을 반환한다.
 * 최초 마운트에는 target 으로 시작하므로 전환은 값이 바뀔 때만 일어난다.
 */
export function useCountUp(
  target: number,
  reduced: boolean,
  duration = 500,
): number {
  const [value, setValue] = useState<number>(target);
  // 렌더 중 최신 표시값을 ref 에 반영 → 다음 전환의 시작점으로 사용
  const valueRef = useRef<number>(target);
  valueRef.current = value;

  useEffect(() => {
    const from = valueRef.current;
    if (reduced || from === target) {
      setValue(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) * (1 - t); // easeOutQuad
      setValue(from + (target - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, reduced, duration]);

  return value;
}
