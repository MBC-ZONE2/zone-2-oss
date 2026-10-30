"use client";
// 피드 카드용 공론 온도 — 배지가 아니라 활자. 6px 점(밴드 잉크색) + "{label} {temp}° {band}"
// 밑줄 링크(온도계). '자세히'를 누르면 괘선 아래 텍스트로 구성 지표·순위 변동이 펼쳐진다.
// 기획 계약(docs/01): 온도 0~100 · 수식 0.4빈도+0.35감정변화+0.25주제집중 · 5구간 · 15분 갱신.
import { useState } from "react";
import Link from "next/link";
import type { TemperatureBoardItem } from "@/types";
import { fmtDateTime, type TemperatureBand } from "@/lib/reels/deck";
import "@/app/dot.css";

export default function TempChip({
  match,
  computedAt,
}: {
  match: { row: TemperatureBoardItem; band: TemperatureBand } | null;
  computedAt?: string | null;
}) {
  const [open, setOpen] = useState(false);
  if (!match) {
    return (
      <span className="tline idle">
        <span className="tline-dot" aria-hidden="true" />
        온도 수집 중
      </span>
    );
  }
  const { row, band } = match;
  const delta = (row.prevRank ?? row.rank ?? 0) - (row.rank ?? 0);
  // 점 색은 밝은 바닥 대비용 잉크 토큰(--temp-N-ink) — 6px 도형에만 쓴다.
  const inkVar = band.colorVar.replace(")", "-ink)");
  const label = `${row.issue?.label ?? ""} ${row.temperature}° ${band.label}`.trim();

  return (
    <div className="tline-wrap">
      <p className="tline" style={{ "--tline-color": inkVar } as React.CSSProperties}>
        <span className="tline-dot" aria-hidden="true" />
        <Link href="/temperature" aria-label={`공론 온도 ${row.temperature}도 ${band.label} — 온도계 열기`}>
          {label}
        </Link>
        <button
          type="button"
          className="tline-toggle"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "접기" : "자세히"}
        </button>
      </p>

      {open && (
        <div className="tpanel-text">
          <dl className="tstats">
            <div>
              <dt>지금 순위</dt>
              <dd>
                {row.rank ?? "-"}위
                <em data-d={delta > 0 ? "up" : delta < 0 ? "down" : "same"}>
                  {delta > 0 ? ` ▲${delta}` : delta < 0 ? ` ▼${-delta}` : " –"}
                </em>
              </dd>
            </div>
            <div>
              <dt>
                언급 빈도 <small>40%</small>
              </dt>
              <dd>{row.frequency ?? "-"}</dd>
            </div>
            <div>
              <dt>
                감정 변화 <small>35%</small>
              </dt>
              <dd>{row.sentimentVar ?? "-"}</dd>
            </div>
            <div>
              <dt>
                주제 집중 <small>25%</small>
              </dt>
              <dd>{row.topicConc ?? "-"}</dd>
            </div>
          </dl>
          <p className="tnote">
            {fmtDateTime(row.computedAt || computedAt)} 산출 · 15분마다 갱신 · 온도 =
            0.4·빈도 + 0.35·감정 변화 + 0.25·주제 집중
          </p>
        </div>
      )}
    </div>
  );
}
