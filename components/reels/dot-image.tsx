"use client";
// 점묘 사진 — 휴면(화면 밖)일 때는 10px 격자 위 반지름 2px 점으로만 보이고,
// 뷰포트에 들어오는 순간 점이 8px 까지 자라며 실사가 자동으로 완전히 열린다.
// CSS mask 만 쓴다(렌즈·캔버스 디더링·서버 API 없음). 스타일은 app/dot.css.
import { useEffect, useRef, useState } from "react";
import "@/app/dot.css";

export default function DotImage({
  src,
  alt = "",
  heightClass = "",
  eager = false,
  className = "",
  onError,
}: {
  src: string | null | undefined;
  /** 장식 사진이면 "" (기본) — aria-hidden 처리 */
  alt?: string;
  /** 높이 프리셋 클래스 (예: "dot-h-hero" = 40dvh, 최대 420px) */
  heightClass?: string;
  /** 첫 화면에 바로 보이는 사진(상세 히어로·스토리 표지): 지연 로딩 없이 즉시 로드하고 한 프레임 뒤 바로 연다 */
  eager?: boolean;
  /** 추가 클래스 (예: .s-card 직계 자식일 때 "bleed" 로 풀블리드) */
  className?: string;
  /** 사진 로딩 실패(403·404·핫링크 차단) — PairPhoto 가 다음 후보로 넘어갈 때 쓴다 */
  onError?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  // 뷰포트 진입 1회 → .is-open (이후 관찰 해제). IO 미지원 환경은 즉시 실사.
  useEffect(() => {
    const el = ref.current;
    if (!el || open) return undefined;
    if (eager) {
      // IO·지연 로딩에 기대지 않는다(마스크된 0×0 박스에서 lazy 이미지가 영영 안 뜨는 문제 회피)
      const id = window.requestAnimationFrame(() => setOpen(true));
      return () => window.cancelAnimationFrame(id);
    }
    if (typeof IntersectionObserver === "undefined") {
      setOpen(true);
      return undefined;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setOpen(true);
          io.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [open, eager]);

  if (!src) return null;

  const cls = ["dot-img", heightClass, className, open ? "is-open" : ""]
    .filter(Boolean)
    .join(" ");
  return (
    <div ref={ref} className={cls}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        aria-hidden={alt ? undefined : true}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        draggable={false}
        onError={onError ? () => onError() : undefined}
      />
    </div>
  );
}
