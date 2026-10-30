// ============================================================================
// app/loading — 홈(릴스 덱/보드) 로딩 지면
//
// 「일점 지면」 로딩 문법: 스켈레톤 시머 없음 — 괘선이 점선으로 그려지고, 데이터가
// 도착한 실제 화면에서 실선으로 이어진다(점선 = 아직 없음, 실선 = 도착).
// 실제 홈과 **같은 레이아웃 클래스**(reels.css 의 .board/.b-hero/.b-card/.t-list/
// .b-grid, 모바일 .deck/.slide/.s-card)를 그대로 써서 로딩→콘텐츠 전환 시 모양이
// 튀지 않게 한다. ReelsShell 이 좌측 SideNav·종이 바닥을 감싸므로 여기서는 본문만.
// 라운드·그림자·면 없음. 점선 괘선 스타일은 app/shell.css(.shell-rule-pending).
// ============================================================================

import "@/app/shell.css";

/** 점선 괘선 한 줄 — 아직 오지 않은 행의 자리. 폭은 className 으로 지정한다. */
function PendingRule({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`shell-rule-pending ${className}`.trim()} />;
}

/** 점선 괘선 묶음 — 본문 n 줄 자리(줄간 = 본문 17px/1.65 ≈ 28px) */
function PendingLines({ count, last = "w-2/3" }: { count: number; last?: string }) {
  return (
    <div className="flex flex-col gap-[27px] pt-[27px]">
      {Array.from({ length: count }).map((_, i) => (
        <PendingRule key={i} className={i === count - 1 ? last : "w-full"} />
      ))}
    </div>
  );
}

export default function Loading() {
  return (
    <>
      {/* 모바일: 릴스 덱 첫 슬라이드 자리 — 점선 괘선만 찍힌다 */}
      <div className="only-mobile">
        <main className="deck" aria-hidden>
          <section className="slide">
            <article className="s-card">
              <PendingRule className="w-24" />
              <PendingLines count={2} last="w-3/4" />
              <PendingRule className="mt-10 w-40" />
              <PendingLines count={3} />
              <PendingRule className="mt-10 w-full" />
            </article>
          </section>
        </main>
      </div>

      {/* 데스크톱: 보드 자리 — 실제 DesktopBoard 구조 그대로, 괘선은 전부 점선 */}
      <div className="only-desktop">
        <div className="board" aria-hidden>
          {/* 히어로: 오디오 브리핑 + 공론 온도 */}
          <section className="b-hero">
            <article className="b-card">
              <PendingRule className="w-24" />
              <PendingLines count={2} last="w-4/5" />
              <PendingRule className="mt-10 w-40" />
              <PendingLines count={3} />
            </article>
            <article className="b-card">
              <PendingRule className="w-20" />
              <PendingLines count={1} last="w-2/3" />
              <ol className="t-list" style={{ marginTop: 14 }}>
                {Array.from({ length: 7 }).map((_, i) => (
                  <li
                    className="t-row"
                    key={i}
                    style={{ display: "flex", alignItems: "center", gap: 12 }}
                  >
                    <PendingRule className="w-5" />
                    <PendingRule className="flex-1" />
                    <PendingRule className="w-16" />
                  </li>
                ))}
              </ol>
            </article>
          </section>

          {/* 크로스뷰 그리드 */}
          <section className="b-section">
            <PendingRule className="w-40" />
            <div className="b-grid" style={{ marginTop: 16 }}>
              {Array.from({ length: 4 }).map((_, i) => (
                <article className="b-card" key={i}>
                  <PendingLines count={2} last="w-4/5" />
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 12,
                      marginTop: 14,
                    }}
                  >
                    <PendingLines count={3} />
                    <PendingLines count={3} />
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
