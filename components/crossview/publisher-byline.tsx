// ============================================================================
// components/crossview/publisher-byline — 발행자 표기 (활자만)
//
// 「일점 지면」: 아바타 원·브랜드 면 없이 소형캡 활자 한 줄로 발행 주체를 밝힌다.
// props(compact/className)는 기존 호출부(home/lead-story) 호환을 위해 유지한다.
// ============================================================================

import { cn } from "@/lib/utils";

export function CrossviewPublisher({
  compact = false,
  className,
}: {
  /** (호환용) 축약 표기 — 활자 크기만 한 단계 낮춘다 */
  compact?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-baseline gap-2 font-medium uppercase tracking-[0.14em] text-muted-foreground",
        compact ? "text-[11px]" : "text-[12px]",
        className,
      )}
      aria-label="발행자 ZONE-2 크로스뷰"
    >
      <strong className="font-bold text-foreground">ZONE-2 크로스뷰</strong>
      <span>편집 발행</span>
    </span>
  );
}
