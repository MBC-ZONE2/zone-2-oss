"use client";
// ============================================================================
// InkDot — 우측 레일의 잉크 점. 「흰 원은 듣는 것, 검은 점은 읽는 자리」.
//
// 덱 스크롤 위치(index/total)를 세로 위치로, 현재 사안의 온도 밴드를 크기·색으로
// 나타낸다. 재생 상태와 무관하다(재생은 백색원 #fn-play 의 몫).
//   - 위치: position fixed, 우측 12px. 상단 96px ~ 하단 96px 사이를 index/(total-1)
//     비율로 이동(350ms cubic-bezier(.2,.8,.2,1), reduced-motion 이면 순간 이동).
//   - 크기·색: 잠잠·null 24px 회색(#8a8f9c) → 매우 뜨거움 32px 수은(#d90429)+링.
//   - button 요소. 탭하면 온도계(/temperature)로 이동한다. 온도값이 있으면 점 왼쪽에 "65°" 라벨(13px).
// 스타일은 app/cover.css(.ink-dot).
// ============================================================================
import { useRouter } from "next/navigation";
import type { CSSProperties } from "react";
import "@/app/cover.css";

export type InkBand = "잠잠" | "미온" | "보통" | "뜨거움" | "매우 뜨거움";

export interface InkDotProps {
  /** 현재 슬라이드 번호(0부터) */
  index: number;
  /** 슬라이드 총 수 */
  total: number;
  /** 현재 슬라이드에 매칭된 온도 밴드 라벨. 매칭 없음/온도 없음이면 null */
  band: InkBand | null;
  /** 밴드에 대응하는 온도값(aria-label 용). 없으면 생략 */
  temperature?: number | null;
  /** 표지 연출 중(백색 수렴 전)에는 점을 찍지 않는다 */
  hidden?: boolean;
}

/** 밴드 라벨 → CSS data-band 키 (한글 라벨을 셀렉터에 쓰지 않기 위한 매핑) */
const BAND_KEY: Record<InkBand, string> = {
  잠잠: "calm",
  미온: "mild",
  보통: "warm",
  뜨거움: "hot",
  "매우 뜨거움": "very-hot",
};

export default function InkDot({ index, total, band, temperature, hidden = false }: InkDotProps) {
  const router = useRouter();
  const ratio = total > 1 ? Math.min(1, Math.max(0, index / (total - 1))) : 0;
  const temp = typeof temperature === "number" ? Math.round(temperature) : null;
  const label =
    band && temp !== null
      ? `공론 온도 ${temp}도 ${band} — 온도계 열기`
      : band
        ? `공론 온도 ${band} — 온도계 열기`
        : "공론 온도계 열기";

  return (
    <button
      type="button"
      className="ink-dot"
      data-band={band ? BAND_KEY[band] : "none"}
      style={{ "--ink-ratio": ratio } as CSSProperties}
      aria-label={label}
      hidden={hidden}
      onClick={() => router.push("/temperature")}
    >
      {/* 점만 있으면 뜻이 안 읽힌다(사용자 지적) — 온도 숫자를 점 왼쪽에 작게 찍는다 */}
      {temp !== null ? (
        <span className="ink-dot-t" aria-hidden="true">
          {temp}°
        </span>
      ) : null}
    </button>
  );
}
