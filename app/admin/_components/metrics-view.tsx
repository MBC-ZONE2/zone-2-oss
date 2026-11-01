// ============================================================================
// app/admin/_components/metrics-view — 검증지표 화면 (서버 컴포넌트, 「일점 지면」 .ad-*)
//
// 구간 탭(10월 기본 / 결과보고 2주·누적 / 시범단 / 최근 30일) → 지표 6칸(숫자 44px·목표·판정 칩·사유) → 승인율 분해 →
// 실적 표(구간) → 최근 30일 일별 괘선 표. 카드·상자 없이 괘선과 활자 무게로만 가른다.
// "전체 누적" 탭과 실적 표의 누적 열은 2026-10-29 대표 지시("전체 누적하지 말고 10월 것만")로 뺐다.
// ============================================================================

import Link from "next/link";
import {
  PERIOD_KEYS,
  PERIOD_LABEL,
  VERDICT_LABEL,
  type DailyRow,
  type MetricsReport,
} from "@/lib/metrics";

const TARGET_LABEL: Record<string, string> = { all: "전체", crossview: "크로스뷰", podcast: "팟캐스트", forum: "공론장" };

function fmtPct(v: number | null, digits = 1): string {
  return v == null ? "—" : `${(v * 100).toFixed(digits)}%`;
}

function podcastCell(d: DailyRow): { text: string; cls: string } {
  if (d.podcastPublished) return { text: "공개", cls: "" };
  if (d.podcastStatus === "review") return { text: "검수 대기", cls: "is-warn" };
  if (d.podcastStatus === "failed") return { text: "실패", cls: "is-bad" };
  if (d.podcastStatus === "generating") return { text: "생성 중", cls: "is-warn" };
  return { text: "없음", cls: "is-bad" };
}

export function MetricsView({ report }: { report: MetricsReport }) {
  const { period } = report;
  const today = report.daily30[report.daily30.length - 1]?.day;
  const generated = report.generatedAt.replace("T", " ").slice(0, 16);

  return (
    <>
      {/* 구간 탭 */}
      <nav aria-label="측정 구간" className="ad-tabs">
        {PERIOD_KEYS.map((k) => (
          <Link key={k} href={`/admin/metrics?period=${k}`} aria-current={period.key === k ? "page" : undefined}>
            {PERIOD_LABEL[k]}
          </Link>
        ))}
        <span className="ad-tabs-r">
          <span>
            {period.since} ~ {period.until} · {period.days}일
          </span>
          <a href={`/api/admin/metrics?period=${period.key}&format=csv`} className="ad-textbtn is-quiet">
            CSV 내려받기
          </a>
        </span>
      </nav>

      {/* 5대 검증지표 */}
      <section aria-labelledby="mt-kpi">
        <div className="ad-section-head">
          <h2 id="mt-kpi">5대 검증지표</h2>
          <p>docs/02-검증지표.md 의 지표 5개 + 1단계 수집 성공률. 집계 {generated} UTC.</p>
        </div>
        <ul className="ad-kpis">
          {report.indicators.map((i) => (
            <li key={i.key} className="ad-kpi" data-v={i.verdict}>
              <p className="ad-eyebrow">
                <span className="ad-tag">지표 {i.no}</span>
                <span>{i.range}</span>
              </p>
              <b>{i.display}</b>
              <strong>{i.title}</strong>
              <p className="ad-target">
                <span>목표 {i.target}</span>
                <span className="ad-verdict" data-v={i.verdict}>
                  {VERDICT_LABEL[i.verdict]}
                </span>
              </p>
              {i.breakdown.length > 0 && (
                <ul className="ad-kpi-br">
                  {i.breakdown.map((b) => (
                    <li key={b.label}>
                      <span>{b.label}</span>
                      {b.display}
                    </li>
                  ))}
                </ul>
              )}
              <p className="ad-kpi-note">{i.note}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* 검수 승인율 분해 */}
      <section aria-labelledby="mt-approval">
        <div className="ad-section-head">
          <h2 id="mt-approval">검수 승인율 — 대상별</h2>
          <p>moderation_logs 기준. 확인(confirm)은 한쪽 소속의 중간 단계, 마감 공개(auto_publish)는 사람 검수가 아닌 자동 공개, 운영 정리(cleanup)는 중복 페어 통합·기사 아닌 클립 제외라 셋 다 승인율에 넣지 않는다.</p>
        </div>
        <div className="ad-scroll">
          <table className="ad-table">
            <thead>
              <tr>
                <th>대상</th>
                <th className="is-num">승인</th>
                <th className="is-num">반려</th>
                <th className="is-num">확인(참고)</th>
                <th className="is-num">마감 공개(제외)</th>
                <th className="is-num">운영 정리(제외)</th>
                <th className="is-num">승인율</th>
              </tr>
            </thead>
            <tbody>
              {report.approval.map((a) => (
                <tr key={a.target}>
                  <td>{TARGET_LABEL[a.target] ?? a.target}</td>
                  <td className="is-num">{a.approved}</td>
                  <td className="is-num">{a.rejected}</td>
                  <td className="is-num is-off">{a.confirms}</td>
                  <td className="is-num is-off">{a.autoPublished}</td>
                  <td className="is-num is-off">{a.cleanup}</td>
                  <td className={`is-num${a.rate == null ? " is-off" : a.rate < 0.85 ? " is-bad" : ""}`}>{fmtPct(a.rate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 수집·생성 실적 */}
      <section aria-labelledby="mt-vol">
        <div className="ad-section-head">
          <h2 id="mt-vol">수집·생성 실적</h2>
          <p>구간 = {period.label} 안에 만들어진 것(created_at, 회차는 scheduled_for).</p>
        </div>
        <div className="ad-scroll">
          <table className="ad-table">
            <thead>
              <tr>
                <th>항목</th>
                <th className="is-num">구간</th>
                <th>비고</th>
              </tr>
            </thead>
            <tbody>
              {report.volumes.map((v) => (
                <tr key={v.key}>
                  <td>{v.label}</td>
                  <td className={`is-num${v.period == null ? " is-off" : ""}`}>{v.period == null ? "—" : v.period.toLocaleString("ko-KR")}</td>
                  <td className="is-off">{v.note ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 최근 30일 일별 */}
      <section aria-labelledby="mt-daily">
        <div className="ad-section-head">
          <h2 id="mt-daily">최근 30일 — 일별</h2>
          <p>공백일이 한눈에 보이게. 수집은 매시(24회/일), 온도는 15분(96회/일), 팟캐는 매일 07시 생성 → 한쪽 확인 뒤 공개.</p>
        </div>
        <div className="ad-scroll">
          <table className="ad-table">
            <thead>
              <tr>
                <th>날짜</th>
                <th className="is-num">수집 성공/실행</th>
                <th className="is-num">어댑터 실패</th>
                <th className="is-num">기사·댓글 적재</th>
                <th className="is-num">온도 성공/실행</th>
                <th className="is-num">감정 분류</th>
                <th className="is-num">여론 매칭/실행</th>
                <th>팟캐</th>
                <th className="is-num">방문자</th>
              </tr>
            </thead>
            <tbody>
              {[...report.daily30].reverse().map((d) => {
                const pod = podcastCell(d);
                const ingestBad = d.ingestRuns === 0 || d.adaptersFailed > 0;
                const tempBad = d.tempRuns === 0 || d.tempOk < d.tempRuns;
                return (
                  <tr key={d.day} data-today={d.day === today ? "true" : undefined}>
                    <td>{d.day}</td>
                    <td className={`is-num${ingestBad ? " is-bad" : ""}`}>
                      {d.ingestOk}/{d.ingestRuns}
                    </td>
                    <td className={`is-num${d.adaptersFailed > 0 ? " is-bad" : " is-off"}`}>{d.adaptersFailed}</td>
                    <td className="is-num">
                      {d.articlesUpserted.toLocaleString("ko-KR")} · {d.commentsUpserted.toLocaleString("ko-KR")}
                    </td>
                    <td className={`is-num${tempBad ? " is-bad" : ""}`}>
                      {d.tempOk}/{d.tempRuns}
                    </td>
                    <td className={`is-num${d.tempPending === 0 ? " is-off" : ""}`}>{d.tempPending === 0 ? "—" : `${d.tempClassified}/${d.tempPending}`}</td>
                    <td className={`is-num${d.tempMatchedAvg == null ? " is-off" : ""}`}>{d.tempMatchedAvg == null ? "—" : d.tempMatchedAvg.toFixed(1)}</td>
                    <td className={pod.cls}>{pod.text}</td>
                    <td className={`is-num${d.visitors === 0 ? " is-off" : ""}`}>{d.visitors}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
