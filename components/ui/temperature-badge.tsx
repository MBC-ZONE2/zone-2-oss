// ============================================================================
// components/ui/temperature-badge — 공론 온도 배지 (「일점 지면」: 텍스트 + 점)
//
// 색 면·패턴 배지를 버리고 활자와 점 하나로 읽는다: 잉크 점 + "{n}° {밴드}" 활자.
// 점은 잠잠이면 회색(#919191), 그 위 구간은 수은(#d90429)이 진해지고, 매우 뜨거움은
// 링을 두른다 — 색 의존 0(숫자·밴드 활자가 항상 병기). 검은 세계(.tw)·종이 어디서나
// currentColor 활자로 앉는다. 스타일: app/temperature.css(.tw-badge).
//
// ⚠️ 표시 밴드의 단일 소스는 lib/temperature/formula.ts 다(F4 SSOT 통일).
//    이 파일은 formula 밴드를 소비만 하고, 하위호환용 별칭을 재노출한다.
// ============================================================================

import { cn } from "@/lib/utils";
import {
  bandForTemperature,
  TEMPERATURE_BANDS,
  type TemperatureBand,
  type TemperaturePattern,
} from "@/lib/temperature/formula";
import "@/app/temperature.css";

// --- 하위호환 별칭: 표시 밴드는 formula.ts 가 단일 소스 -----------------------
export type { TemperaturePattern };
/** @deprecated formula 의 TemperatureBand 를 사용하라. */
export type TemperatureBadgeBand = TemperatureBand;
/** @deprecated formula 의 TEMPERATURE_BANDS 를 사용하라. */
export const TEMPERATURE_BADGE_BANDS = TEMPERATURE_BANDS;
/** @deprecated formula 의 bandForTemperature 를 사용하라. */
export const badgeBandForTemperature = bandForTemperature;

/** 밴드 라벨 → data-band 키(한글 라벨을 셀렉터에 쓰지 않기 위한 매핑) */
export const BAND_KEY: Record<string, string> = {
  잠잠: "calm",
  미온: "mild",
  보통: "warm",
  뜨거움: "hot",
  "매우 뜨거움": "very-hot",
};

export interface TemperatureBadgeProps {
  /** 공론 온도 (0~100) */
  temperature: number;
  /** 크기 */
  size?: "sm" | "md";
  /** (하위호환) 이전 패턴 표시 플래그 — 점 표기에서는 무시된다 */
  showPattern?: boolean;
  className?: string;
}

/** 공론 온도 배지 — 점 + 숫자 + 밴드 활자. */
export function TemperatureBadge({
  temperature,
  size = "md",
  className,
}: TemperatureBadgeProps) {
  const band = bandForTemperature(temperature);
  const value = Math.round(
    Number.isFinite(temperature) ? Math.min(100, Math.max(0, temperature)) : 0,
  );

  return (
    <span
      role="img"
      aria-label={`공론 온도 ${value}도, ${band.label} 단계`}
      data-band={BAND_KEY[band.label] ?? "calm"}
      className={cn("tw-badge", size, className)}
    >
      <span aria-hidden className="tw-badge-dot" />
      <span>{value}°</span>
      <span className="tw-badge-label">{band.label}</span>
    </span>
  );
}
