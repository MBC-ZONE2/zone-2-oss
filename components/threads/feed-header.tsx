// ============================================================================
// components/threads/feed-header — 피드 컬럼 상단 고정 헤더 (문서 페이지 공통)
//
// 각 화면 최상단에 붙는 sticky 제목 바. 좌측 제목 25px 700 잉크 + 우측 캡션 15px
// 보조 잉크. 종이 불투명(유리 없음), 하단 1px 괘선. 크로스뷰·공고·공론장 등이
// 동일한 헤더 언어를 공유한다. .feed-header 클래스는 reels.css 가 우측 여백을
// 잡는 안정 셀렉터라 유지한다.
// ============================================================================

export function FeedHeader({
  title,
  meta,
}: {
  title: string;
  meta?: string;
}) {
  return (
    <div className="feed-header sticky top-0 z-30 flex items-baseline justify-between gap-3 border-b border-line bg-background px-5 py-3 sm:px-[76px]">
      <h1 className="text-[25px] font-bold leading-tight tracking-[-0.02em] text-foreground">
        {title}
      </h1>
      {meta ? (
        <span className="shrink-0 text-[15px] font-medium text-muted-foreground">
          {meta}
        </span>
      ) : null}
    </div>
  );
}
