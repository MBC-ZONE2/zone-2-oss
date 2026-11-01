// ============================================================================
// components/ui/press-label — 매체 명판 (광역/기초 구분)
//
// 「일점 지면」 광역/기초 구분법 — 색이 아니라 자리·마커·활자 무게로 가른다.
//   - tier="macro": 광역 · MBC충북 — ⋯ 6px 보라(#6706d3) 점 3개
//   - tier="micro": 기초 · 옥천신문 — ▬ 18×3px 분홍(#e66bd2) 괘선 토막
// 마커 색은 6px 도형에만 쓰고 활자는 잉크다. 매체명('MBC충북'/'옥천신문')은 항상
// 활자로 병기한다. 고대비(data-contrast=high)에서는 마커도 현재 글자색(잉크/백색)
// 으로 — 자리와 라벨만으로 구분된다(app/shell.css).
//
// 접근성: 마커는 aria-hidden, '광역'/'기초' 범위명은 스크린리더 전용 텍스트로
// 유지해 색각 이상·음성 환경 모두에서 판별된다. props 시그니처는 그대로.
// ============================================================================

import { cn } from "@/lib/utils";
import "@/app/shell.css";

export type PressTier = "macro" | "micro";

export interface PressLabelProps {
  /** 매체 계층: 광역(macro)/기초(micro) */
  tier: PressTier;
  /** 크기 */
  size?: "sm" | "md";
  /**
   * 검은 세계(#0b0d12) 위에 얹을 때 활자를 백색 계열로 반전한다. 기본 false 라
   * 기존 호출부(종이 배경)는 그대로 동작한다(시그니처 하위호환).
   */
  inverse?: boolean;
  className?: string;
}

/** 계층별 명판 구성 (범위명 · 매체명) */
const TIER_CONFIG: Record<PressTier, { scope: string; name: string }> = {
  macro: { scope: "광역", name: "MBC충북" },
  micro: { scope: "기초", name: "옥천신문" },
};

const SIZE_CLASSES = {
  sm: "gap-2 text-[12px]",
  md: "gap-2.5 text-[15px]",
} as const;

/** 매체 마커 — 광역 ⋯(점 3개) / 기초 ▬(괘선 토막). 장식이라 aria-hidden. */
function PressMark({ tier }: { tier: PressTier }) {
  if (tier === "macro") {
    return (
      <span aria-hidden className="press-mark press-mark--macro">
        <i />
        <i />
        <i />
      </span>
    );
  }
  return (
    <span aria-hidden className="press-mark press-mark--micro">
      <i />
    </span>
  );
}

/** 매체 명판 — 마커(도형) + 매체명 활자. */
export function PressLabel({
  tier,
  size = "md",
  inverse = false,
  className,
}: PressLabelProps) {
  const cfg = TIER_CONFIG[tier];

  return (
    <span
      className={cn(
        "inline-flex w-fit items-center font-medium leading-none",
        inverse ? "text-[#f4f5f7]" : "text-foreground",
        SIZE_CLASSES[size],
        className,
      )}
    >
      <PressMark tier={tier} />
      {/* 범위명은 음성으로만 — 시각적 구분은 자리·마커·활자 무게가 맡는다 */}
      <span className="sr-only">{cfg.scope} · </span>
      <span>{cfg.name}</span>
    </span>
  );
}
