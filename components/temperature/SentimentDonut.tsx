"use client";

// ============================================================================
// components/temperature/SentimentDonut — 감정 분포 도넛 (Recharts, FR-TH-06)
//
// 검은 세계 팔레트: 긍정 #7ea4ff · 중립 #919191 · 부정 수은 #d90429. 색 의존을 피해
// 각 조각 곁에 한글 라벨+퍼센트를 직접 표기하고, figure aria-label 로 수치를 읽어 준다.
// 데이터가 없으면(sentiment 전부 NULL) 아무것도 렌더하지 않는다 — 기획안 (6): 도넛 숨김.
// recharts 는 기설치 의존성. 도넛 애니메이션은 사용하지 않는다(정적 분포).
// ============================================================================

import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  type PieLabelRenderProps,
} from "recharts";

interface SentimentDistProp {
  pos: number;
  neu: number;
  neg: number;
}

interface Segment {
  key: keyof SentimentDistProp;
  name: string;
  color: string;
}

const SEGMENTS: readonly Segment[] = [
  { key: "pos", name: "긍정", color: "#7ea4ff" },
  { key: "neu", name: "중립", color: "#919191" },
  { key: "neg", name: "부정", color: "#d90429" },
] as const;

const RAD = Math.PI / 180;

export interface SentimentDonutProps {
  dist: SentimentDistProp;
  height?: number;
}

/** 감정 분포 도넛 (색 + 직접 라벨). 데이터가 없으면 null(숨김). */
export function SentimentDonut({ dist, height = 220 }: SentimentDonutProps) {
  const total = dist.pos + dist.neu + dist.neg;
  if (total === 0) return null;

  const data = SEGMENTS.map((s) => ({ ...s, value: dist[s.key] }));
  const summary = `감정 분포: 긍정 ${dist.pos}건, 중립 ${dist.neu}건, 부정 ${dist.neg}건`;

  return (
    <figure aria-label={summary} className="tw-donut">
      <div style={{ position: "relative", height }}>
        <ResponsiveContainer width="100%" height={height}>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius="52%"
              outerRadius="68%"
              paddingAngle={2}
              stroke="#0b0d12"
              strokeWidth={2}
              isAnimationActive={false}
              labelLine={{ stroke: "rgba(244,245,247,0.28)", strokeWidth: 1 }}
              label={renderSliceLabel}
            >
              {data.map((d) => (
                <Cell key={d.key} fill={d.color} />
              ))}
            </Pie>
            <Tooltip
              wrapperStyle={{ outline: "none" }}
              contentStyle={{
                fontSize: 15,
                borderRadius: 0,
                border: "1px solid #f4f5f7",
                background: "#0b0d12",
                color: "#f4f5f7",
                boxShadow: "none",
              }}
              itemStyle={{ color: "#f4f5f7" }}
              formatter={(value, name) => {
                const n = typeof value === "number" ? value : Number(value);
                const pct = total ? Math.round((n / total) * 100) : 0;
                return [`${n}건 (${pct}%)`, String(name)];
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="tw-donut-center">
          <b>{total}</b>
          <span>댓글</span>
        </div>
      </div>
    </figure>
  );
}

/** 조각 곁 직접 라벨 — 한글 감정명 + 퍼센트. */
function renderSliceLabel(props: PieLabelRenderProps) {
  const pct = Math.round((props.percent ?? 0) * 100);
  if (pct <= 0) return null; // 0 조각은 라벨 생략

  const cx = Number(props.cx);
  const cy = Number(props.cy);
  const midAngle = Number(props.midAngle);
  const outerRadius = Number(props.outerRadius);
  const r = outerRadius + 14;
  const x = cx + r * Math.cos(-midAngle * RAD);
  const y = cy + r * Math.sin(-midAngle * RAD);
  const anchor = x >= cx ? "start" : "end";

  return (
    <text
      key={`sent-label-${props.index ?? props.name}`}
      x={x}
      y={y}
      textAnchor={anchor}
      dominantBaseline="central"
      fontSize={15}
      style={{ fill: "#f4f5f7" }}
    >
      <tspan fontWeight={700}>{String(props.name)}</tspan>
      <tspan dx={6} style={{ fill: "#919191" }}>
        {pct}%
      </tspan>
    </text>
  );
}
