// ============================================================================
// components/ui/media-icon — 매체 아이콘(검토 취합본 반영)
//
// 방송(MBC충북) = 송신탑, 지면(옥천신문) = 종이신문. 1px 잉크 선, 채움 없음.
// 헤드라인 앞 ⋯/▬ 마커(정치색 회피용)를 대체하지 않고 **출처 표기·범례 옆**에만 쓴다.
// currentColor 를 쓰므로 글자색을 따라간다. 기본 16px, aria-hidden(장식).
// ============================================================================

import type { SVGProps } from "react";

export type MediaKind = "broadcast" | "paper";

/** 송신탑 — 방송 */
export function TowerIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M8 6.5v8M5.2 14.5l2.8-8 2.8 8M6.6 11h2.8" />
      <circle cx="8" cy="5" r="1.4" />
      <path d="M4.6 2.6a4.8 4.8 0 0 0 0 4.8M11.4 2.6a4.8 4.8 0 0 1 0 4.8" />
    </svg>
  );
}

/** 종이신문 — 지면 */
export function NewspaperIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M2.5 3.5h9.5v8.5a1.5 1.5 0 0 0 3 0V6h-3" />
      <path d="M2.5 3.5v8.5a1.5 1.5 0 0 0 1.5 1.5h10" />
      <path d="M4.5 6h3v2.5h-3zM9 6h1.2M9 8.5h1.2M4.5 10.5h5.7" />
    </svg>
  );
}

/** 출처 표기용 — kind 에 맞는 아이콘 하나 */
export function MediaIcon({ kind, ...props }: { kind: MediaKind } & SVGProps<SVGSVGElement>) {
  return kind === "broadcast" ? <TowerIcon {...props} /> : <NewspaperIcon {...props} />;
}
