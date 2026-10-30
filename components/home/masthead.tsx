// ============================================================================
// components/home/masthead — 홈(1면) 상단 발행 정보 줄 (얇은 dateline)
//
// 히어로 위에 얹히는 얇은 발행 정보 한 줄: 오늘 날짜(요일 포함) · 공동 발행 표기.
// 아래 이중 괘선으로 1면의 시작을 구획한다. 서비스 한 줄 소개는 히어로가 대신
// 전달하므로 여기서는 발행 정보만 둔다(제호/헤드라인 중복 방지).
//
// 날짜는 서버(Home)에서 Asia/Seoul 기준으로 이미 포맷해 문자열로 받는다. 홈은
// 서버 컴포넌트 subtree 라 클라이언트가 재계산하지 않으므로 하이드레이션 불일치
// 가 없다(추가 안전장치로 날짜 span 에 suppressHydrationWarning).
// ============================================================================

interface HomeMastheadProps {
  /** "2026년 7월 5일 토요일" 형태의 서버 포맷 날짜 */
  dateText: string;
}

/** 홈 1면 상단 발행 정보 줄 (얇은 밴드) */
export function HomeMasthead({ dateText }: HomeMastheadProps) {
  return (
    <section aria-label="오늘의 발행 정보" className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground sm:text-xs">
        <span suppressHydrationWarning>{dateText}</span>
        <span>MBC충북 &times; 옥천신문 공동</span>
      </div>
      <div className="z2-rule-double mt-1" aria-hidden />
    </section>
  );
}
