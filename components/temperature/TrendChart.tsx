// ============================================================================
// components/temperature/TrendChart — 24시간 온도 추이 · 도트 스파크라인 (FR-TH-05)
//
// 훅·이벤트 없는 순수 렌더 → 서버 컴포넌트(상세 페이지에서 서버 렌더). 시각 라벨은
// Asia/Seoul 고정이라 서버·브라우저 어디서 그려도 같다.
// 검은 세계 문법: 선 대신 점. 포인트마다 지름 5px 점(#7ea4ff), 마지막(현재) 점만
// 수은(#d90429)으로 크게. 구간 경계(20/40/60/80)는 점선 괘선.
// 활자는 전부 SVG 밖 HTML 이다(viewBox 축소로 글자가 9px 로 줄던 문제):
//   - SVG viewBox = 그림 영역 그대로(여백 0) → 눈금(0/50/100)·시각 4개는 HTML 로
//     그림 영역 기준 %(top/left) 절대 배치 — 폭이 변해도 글자는 15px 그대로.
//   - 5구간 범례(점+이름+범위)는 차트 아래 가로 배열(BandList).
// 순수 SVG(recharts 없음) — 등장 애니메이션 없음(찍힘). 데이터 없으면 안내.
// props 계약(points·color·height)은 이전과 같다(color 는 호환용, 수은 고정).
// 스타일: app/temperature.css(.tw-trend*)
// ============================================================================

import type { TemperaturePoint } from "@/types";
import { TEMPERATURE_BANDS } from "@/lib/temperature/formula";
import { BandList } from "./BandList";

export interface TrendChartProps {
  points: TemperaturePoint[];
  /** (호환) 현재 포인트 강조 색 — 검은 세계에서는 수은 고정이라 무시 */
  color?: string;
  height?: number;
}

/** 구간 경계값(참조선용) — SSOT 밴드에서 파생(첫 하한 0 제외한 내부 경계). */
const BAND_BOUNDARIES = TEMPERATURE_BANDS.slice(1).map((b) => b.min);

const VW = 600; // viewBox 폭 — 그림 영역 = viewBox 전체(여백 없음)

/** HH:MM 포맷 — 한국 시간(Asia/Seoul) 고정, 00~23시(h23: 자정을 24시로 찍지 않음) */
const TIME_FMT = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return TIME_FMT.format(d);
}

/** 온도 → 그림 영역 위에서의 세로 위치(%). 0° 바닥, 100° 꼭대기 */
function topPct(t: number): number {
  return 100 - Math.min(100, Math.max(0, t));
}

/** 온도 추이 도트 스파크라인. 데이터가 없으면 안내 문구. */
export function TrendChart({ points, height = 220 }: TrendChartProps) {
  if (points.length === 0) {
    return <p className="tw-empty">추이 데이터가 아직 없습니다.</p>;
  }

  const n = points.length;
  // 가로 위치 — 0~1 비율(SVG 좌표·HTML % 가 같은 비율을 쓴다)
  const ratio = (i: number) => (n === 1 ? 0.5 : i / (n - 1));
  const xAt = (i: number) => ratio(i) * VW;
  const yAt = (t: number) => (topPct(t) / 100) * height;

  // x축 라벨 3~4개(시작·1/3·2/3·끝)
  const sampleIdx =
    n <= 4
      ? points.map((_, i) => i)
      : [0, Math.round((n - 1) / 3), Math.round((2 * (n - 1)) / 3), n - 1];
  const last = points[n - 1];
  const first = points[0];
  const maxT = points.reduce((m, p) => Math.max(m, p.temperature), 0);
  const summary = `지난 ${n}개 포인트, 현재 ${Math.round(last.temperature)}도, 최고 ${Math.round(maxT)}도`;

  return (
    <figure className="tw-trend" aria-label={`온도 추이: ${summary}`}>
      {/* 프레임 = 좌(눈금)·하(시각) 활자 자리 + 그림 영역 */}
      <div className="tw-trend-frame">
        <div className="tw-trend-plot">
          <svg
            className="tw-spark"
            viewBox={`0 0 ${VW} ${height}`}
            aria-hidden
            focusable="false"
          >
            {/* 구간 경계 — 점선 괘선 */}
            {BAND_BOUNDARIES.map((b) => (
              <line
                key={b}
                x1={0}
                x2={VW}
                y1={yAt(b)}
                y2={yAt(b)}
                stroke="rgba(126,164,255,0.35)"
                strokeWidth={1}
                strokeDasharray="1 4"
              />
            ))}
            {/* 바닥 괘선(실선 = 데이터 도착) */}
            <line
              x1={0}
              x2={VW}
              y1={height}
              y2={height}
              stroke="rgba(244,245,247,0.28)"
              strokeWidth={1}
            />
            {/* 도트 */}
            {points.map((p, i) => {
              const isLast = i === n - 1;
              return (
                <circle
                  key={`${p.computedAt}-${i}`}
                  cx={xAt(i)}
                  cy={yAt(p.temperature)}
                  r={isLast ? 5 : 2.5}
                  fill={isLast ? "#d90429" : "#7ea4ff"}
                />
              );
            })}
          </svg>
          {/* 0·50·100 눈금 — 그림 영역 왼쪽, 세로 % 절대 배치(HTML 활자) */}
          <ol className="tw-trend-y" aria-hidden>
            {[0, 50, 100].map((v) => (
              <li key={v} style={{ top: `${topPct(v)}%` }}>
                {v}
              </li>
            ))}
          </ol>
          {/* x축 시각 라벨 — 그림 영역 아래, 가로 % 절대 배치(HTML 활자) */}
          <ol className="tw-trend-x" aria-hidden>
            {sampleIdx.map((i, k) => (
              <li
                key={`${i}-${k}`}
                data-edge={i === 0 ? "start" : i === n - 1 ? "end" : undefined}
                style={{ left: `${ratio(i) * 100}%` }}
              >
                {fmtTime(points[i].computedAt)}
              </li>
            ))}
          </ol>
        </div>
      </div>
      {/* 5구간 범례 — SVG 밖 HTML, 가로 배열 */}
      <BandList className="tw-trend-legend" label="온도 구간 범례" />
      <figcaption className="tw-spark-caption">
        <span>
          {fmtTime(first.computedAt)} → {fmtTime(last.computedAt)}
        </span>
        <span>
          현재 <b style={{ color: "#f4f5f7" }}>{Math.round(last.temperature)}°</b> · 최고{" "}
          {Math.round(maxT)}°
        </span>
      </figcaption>
    </figure>
  );
}
