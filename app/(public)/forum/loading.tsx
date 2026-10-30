// ============================================================================
// /forum — 로딩 지면
//
// 괘선이 점선으로 그려지고 데이터가 도착하면 실선이 된다(기획안 (6) 로딩).
// 스켈레톤 시머·등장 애니메이션 없음 — 마스트는 실제 활자로 먼저 찍힌다.
// ============================================================================

import "@/app/forum.css";

export default function ForumLoading() {
  return (
    <main className="forum forum-page forum-list" aria-busy="true">
      <header className="fo-mast">
        <h1>공론장</h1>
        <p className="fo-mast-meta">
          <span>독자가 말한다</span>
        </p>
      </header>
      {/* 글자 대신 스켈레톤(사용자 요청) — 탭 줄·정렬 줄·글 6행의 자리를 점선 막대로 잡는다. 시머 없음 */}
      <span className="sr-only" role="status">의견을 불러오는 중</span>
      <div className="fo-loading-tabs" aria-hidden="true">
        <i style={{ width: "28%" }} />
        <i style={{ width: "22%" }} />
      </div>
      <ul className="fo-rows" aria-hidden="true">
        {Array.from({ length: 6 }).map((_, i) => (
          <li key={i} className="fo-loading-row">
            <i className="fo-sk-dot" />
            <i className="fo-sk-title" style={{ width: `${62 + ((i * 13) % 30)}%` }} />
            <i className="fo-sk-meta" style={{ width: "34%" }} />
          </li>
        ))}
      </ul>
    </main>
  );
}
