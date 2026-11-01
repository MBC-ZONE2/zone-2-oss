// ============================================================================
// components/ui/ai-verified-label — "AI가 정리" 라벨
//
// AI가 생성하고 편집자가 검수한 콘텐츠임을 표시한다. 신뢰 표지이므로
// verified=false 면 렌더하지 않는다(null 반환).
// 「일점 지면」 두 가지 모양(variant):
//   - "stamp": 분홍(#e66bd2) 필드 위 잉크 18px 700 'AI가 정리' 스탬프 (기본).
//              크로스뷰 상세·팟캐 목록 헤더처럼 한 화면 1곳에만 찍는다.
//   - "line" : 12px 회색 한 줄 "AI가 정리 · 편집자 검수 {일시}" — 목록 행·메타 줄용.
// 색 의존 0: 'AI가 정리' 활자가 곧 정보다. 고대비에서 필드는 백색/검정(app/shell.css).
// ============================================================================

import { cn } from "@/lib/utils";
import "@/app/shell.css";

export interface AIVerifiedLabelProps {
  /** 검수 완료 여부. false 면 렌더하지 않는다. */
  verified: boolean;
  /** 검수 일시 (ISO 문자열 또는 Date). 있으면 툴팁·한 줄 라벨에 표기. */
  verifiedAt?: string | Date;
  /** 크기 — stamp 는 18px 고정, line 은 sm 12px / md 15px */
  size?: "sm" | "md";
  /** 모양: 분홍 스탬프(기본) / 회색 한 줄 */
  variant?: "stamp" | "line";
}

/** 검수 일시를 한국 시간(KST) 고정으로 포맷 — 서버/클라이언트 결과 일치 보장 */
function formatVerifiedAt(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

/** AI 정리·검수완료 라벨. 미검수(verified=false)면 아무것도 렌더하지 않는다. */
export function AIVerifiedLabel({
  verified,
  verifiedAt,
  size = "md",
  variant = "stamp",
}: AIVerifiedLabelProps) {
  if (!verified) return null;

  const formatted = verifiedAt ? formatVerifiedAt(verifiedAt) : "";
  const tooltip = formatted
    ? `AI가 생성하고 편집자가 검수한 콘텐츠입니다 · 검수 ${formatted}`
    : "AI가 생성하고 편집자가 검수한 콘텐츠입니다";
  const ariaLabel = `AI 생성·검수완료${formatted ? ` (검수 ${formatted})` : ""}`;

  if (variant === "line") {
    // 회색 한 줄 — 메타 줄에 얹는 활자
    return (
      <span
        role="img"
        aria-label={ariaLabel}
        title={tooltip}
        className={cn(
          "inline-flex items-center font-medium leading-[1.6] text-muted-foreground",
          size === "sm" ? "text-[12px]" : "text-[15px]",
        )}
      >
        AI가 정리{formatted ? ` · 편집자 검수 ${formatted}` : " · 편집자 검수"}
      </span>
    );
  }

  // 분홍 스탬프 — 잉크 활자 18px
  return (
    <span role="img" aria-label={ariaLabel} title={tooltip} className="ai-stamp">
      AI가 정리
    </span>
  );
}
