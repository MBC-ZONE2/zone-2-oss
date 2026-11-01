// ============================================================================
// /podcast — 로딩 (FR-PC-06)
//
// 시머 없음. 목록과 같은 자리(녹음실 띠 · 최신 회차 · 지난 회차)에 괘선을
// 점선으로 먼저 찍고, 데이터가 오면 같은 자리의 괘선이 실선이 된다(CLS 최소).
// ============================================================================

import { region } from "@/config/region";
import "@/app/podcast.css";

export default function PodcastLoading() {
  return (
    <main className="pc-loading" aria-busy="true" aria-label={`${region.podcast.seriesName} 불러오는 중`}>
      <header className="pc-band px-5 sm:px-[76px]">
        <h1>{region.podcast.seriesName} · {region.podcast.seriesSub}</h1>
        <span className="pc-stamp">AI가 만든</span>
      </header>

      <section className="pc-lead px-5 sm:px-[76px]" aria-hidden="true">
        <p className="pc-k">최신 회차</p>
        <span className="sr-only" role="status">불러오는 중</span>
        <div className="pc-dash pc-dash--title" />
        <div className="pc-dash" />
        <div className="pc-dash" />
      </section>

      <section className="pc-past px-5 sm:px-[76px]" aria-hidden="true">
        <h2 className="pc-h">지난 회차</h2>
        <ol className="pc-rows">
          {Array.from({ length: 4 }).map((_, i) => (
            <li key={i} className="pc-row" />
          ))}
        </ol>
      </section>
    </main>
  );
}
