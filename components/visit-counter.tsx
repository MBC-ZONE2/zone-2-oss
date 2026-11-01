"use client";

// ============================================================================
// components/visit-counter — 푸터 한 줄 "오늘 N명 · 누적 M명 방문" (2026-10-26 대표 지시)
//
// 자리: components/site-footer 저작권 줄 바로 위(대표 선택 "1번"). 세 자리(홈 모바일 끝 슬라이드·
// 홈 데스크탑 보드 끝·그 외 화면 본문 끝)에 같은 부품이 나온다.
// 값: GET /api/visit/stats(60초 캐시). 누적 = 일별 순방문자 합(대표 결정 "일별 합", 0029).
// 서버 컴포넌트인 푸터가 정적 페이지(/about·/privacy)에서도 쓰이므로 클라이언트에서 가져온다.
// 받기 전에는 빈 줄 높이만 잡아 두고(레이아웃 점프 방지), 실패하면 줄을 지운다.
// 「일점 지면」: 13px 보조색 활자, 숫자만 잉크 굵게. 상자·아이콘 없음.
// ============================================================================

import { useEffect, useState } from "react";

interface Counters {
  today: number;
  total: number;
  since: string;
}

type State = { kind: "loading" } | { kind: "ok"; data: Counters } | { kind: "failed" };

const nf = new Intl.NumberFormat("ko-KR");

/** "2026-10-11" → "2026.10.11" */
function shortDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[1]}.${m[2]}.${m[3]}` : iso;
}

export function VisitCounter() {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    const ac = new AbortController();
    fetch("/api/visit/stats", { signal: ac.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        const j = (await r.json()) as Partial<Counters>;
        if (typeof j.today !== "number" || typeof j.total !== "number") throw new Error("shape");
        setState({ kind: "ok", data: { today: j.today, total: j.total, since: String(j.since ?? "") } });
      })
      .catch(() => {
        if (!ac.signal.aborted) setState({ kind: "failed" });
      });
    return () => ac.abort();
  }, []);

  if (state.kind === "failed") return null;
  if (state.kind === "loading") {
    return <p className="sf-visits" aria-busy="true">&nbsp;</p>;
  }
  const { today, total, since } = state.data;
  return (
    <p className="sf-visits">
      <span>
        오늘 <b>{nf.format(today)}</b>명 · 누적 <b>{nf.format(total)}</b>명 방문
      </span>
      <span className="sf-visits-note">{since ? `${shortDate(since)}부터 · ` : ""}하루 한 번 익명 집계</span>
    </p>
  );
}
