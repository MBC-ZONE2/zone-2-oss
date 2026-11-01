"use client";

// ============================================================================
// components/temperature/hooks — 온도계 클라이언트 훅 (모션·카운트업)
//
// prefers-reduced-motion 감지와 숫자 카운트업 전환을 제공한다.
// 접근성 1급: 모션 최소화 설정 시 애니메이션 없이 즉시 최종값으로 반영한다.
// (home/hooks 와 동일 계약 — 기능 모듈 독립성을 위해 별도 보유)
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

/**
 * 「차오름」 — 마운트 시 0 에서 target 까지 duration(ms) 동안 outCubic 으로 오른다
 * (수은과 같은 박자). 이후 target 이 바뀌면 현재값에서 600ms 로 옮겨간다.
 * SSR·첫 렌더는 target 그대로(숫자가 지면에 찍혀 있어야 한다), reduced 면 즉시.
 */
export function useRise(target: number, reduced: boolean, duration = 1200): number {
  const [value, setValue] = useState<number>(target);
  const shownRef = useRef<number>(target);
  const firstRef = useRef(true);
  shownRef.current = value;

  useEffect(() => {
    const first = firstRef.current;
    firstRef.current = false;
    const from = first ? 0 : shownRef.current;
    const dur = first ? duration : 600;
    if (reduced || from === target) {
      setValue(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3); // outCubic
      setValue(from + (target - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, reduced, duration]);

  return value;
}
