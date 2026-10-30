// ============================================================================
// components/reels/photo-credit — 사진 캡션 자리의 13px 출처 한 줄
//
// 회의 결정 [3]: 옥천신문/MBC충북 원본 사진을 쓸 때는 "사진 · 옥천신문" 출처를 붙인다.
// 문구는 lib/reels/pair-image 의 pairImage(...).credit 이 만든다 — 여기서는 조판만.
// 「일점 지면」: 카드·라운드·그림자 없음, 보조 잉크(--cs-sub → --sub) 13px 한 줄.
// 공용 CSS 를 새로 만들지 않고 인라인으로 둔다(다른 화면의 괘선·간격 규칙과 충돌하지 않게).
// ============================================================================

const BASE: React.CSSProperties = {
  margin: "4px 0 0",
  fontSize: 13,
  fontWeight: 500,
  lineHeight: 1.4,
  letterSpacing: 0,
  color: "var(--cs-sub, var(--sub, #5b6170))",
  textAlign: "right", // 대표 지시 2026-10-19: 사진 아래 "사진 · 옥천신문" 은 오른쪽에
};

export default function PhotoCredit({
  credit,
  className,
  style,
}: {
  /** pairImage(...).credit — null 이면 아무것도 그리지 않는다(AI 생성·사진 없음) */
  credit: string | null | undefined;
  className?: string;
  /** 좌우 여백 등 화면별 보정(예: 스토리 표지의 var(--cs-gutter)) */
  style?: React.CSSProperties;
}) {
  if (!credit) return null;
  return (
    <p className={className} style={style ? { ...BASE, ...style } : BASE}>
      {credit}
    </p>
  );
}
