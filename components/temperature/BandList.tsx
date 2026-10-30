// ============================================================================
// components/temperature/BandList — 온도 5구간 목록 (점 + 이름 + 범위), 순수 렌더
//
// 훅·이벤트 없음 → 서버/클라이언트 어디서나 쓴다. 밴드 소스는 formula.ts(SSOT),
// 점 색은 배지와 같은 .tw-badge[data-band] 규칙(잠잠 회색, 위로 갈수록 수은 진해짐).
// 쓰는 곳: TrendChart 범례(SVG 밖 HTML) · TemperatureLegend 펼침 패널 · 보드 히어로 안내.
// 스타일: app/temperature.css(.tw-bands)
// ============================================================================

import { TEMPERATURE_BANDS } from "@/lib/temperature/formula";
import { BAND_KEY } from "@/components/ui/temperature-badge";

/** 필수 안내문구 (온도의 의미 오해 방지) — 범례·히어로 안내 공용 */
export const BAND_NOTICE = "높은 온도는 관심·활발한 논의를 나타냅니다(좋고 나쁨이 아닙니다).";

export interface BandListProps {
  className?: string;
  /** 접근성 이름(생략 시 "온도 구간") */
  label?: string;
}

/** 5구간 목록 — 각 줄 = 점 + 이름 + "min~max°". */
export function BandList({ className, label = "온도 구간" }: BandListProps) {
  return (
    <ul className={className ? `tw-bands ${className}` : "tw-bands"} aria-label={label}>
      {TEMPERATURE_BANDS.map((b, i) => {
        // 표시 상한: 다음 구간 하한 - 1, 마지막은 100 (기준안 03 §6 정수 버킷)
        const upper = i < TEMPERATURE_BANDS.length - 1 ? TEMPERATURE_BANDS[i + 1].min - 1 : 100;
        return (
          <li key={b.label} className="tw-badge" data-band={BAND_KEY[b.label] ?? "calm"}>
            <i aria-hidden className="tw-badge-dot" />
            <b>{b.label}</b>
            <span>
              {b.min}~{upper}°
            </span>
          </li>
        );
      })}
    </ul>
  );
}
