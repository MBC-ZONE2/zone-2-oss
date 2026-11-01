// ============================================================================
// components/crossview/ai-summary — 'AI가 정리' 분홍 스탬프 + reading_point 인용괘선
//
// 「일점 지면」 유채색 면 허용 한 곳: 'AI가 정리' 분홍(#e66bd2) 필드 위 18px 잉크 글자.
// 그 아래 reading_point 를 좌측 1px 인용괘선으로 찍는다(17px/1.65).
// 광역/기초 요약은 두 칼럼(lens-view)이 맡으므로 여기서는 재출력하지 않는다.
// readingPoint 가 없으면 섹션을 노출하지 않는다. 서버 컴포넌트.
// .dk-read = 데스크탑(≥1100) 활자 폭 상한 760px(app/reels.css) — 폰에서는 무효.
// ============================================================================

export function AiSummary({ readingPoint }: { readingPoint: string | null }) {
  const point = readingPoint?.trim() || null;
  if (!point) return null;

  return (
    <section className="cvp-ai dk-read" aria-labelledby="ai-summary-title">
      <h2 id="ai-summary-title" className="cvp-stamp">
        AI가 정리
      </h2>
      <blockquote className="cvp-quote">{point}</blockquote>
    </section>
  );
}
