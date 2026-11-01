// ============================================================================
// components/temperature/IndexBars — 온도 구성 3지표 짧은 기둥
//
// temperature = 100 × (0.4·빈도 + 0.35·감정 편차 + 0.25·주제 집중). 저장값은 0~100.
// 빈도(#b18cff)·주제 집중(#7ea4ff)은 실선 트랙, 감정 편차(수은)는 값이 없으면 점선 트랙
// — 기획안 (6): comments.sentiment 가 NULL 이라 감정만 점선. 순수 서버/클라 공용.
// 결측은 null/비유한수일 때만("—"·자료 없음). 계산된 0 은 숫자 0 + 빈 게이지로 그린다.
// 스타일: app/temperature.css(.tw-idx*)
// ============================================================================

export interface IndexBarsProps {
  frequency: number | null;
  sentimentVar: number | null;
  topicConc: number | null;
}

interface Row {
  key: "frequency" | "sentimentVar" | "topicConc";
  label: string;
  weight: string;
  value: number | null;
}

/** 0~100 보정(NaN·범위 밖 방어). null 은 그대로 */
function clamp(v: number | null): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  return Math.min(100, Math.max(0, v));
}

/** 구성 3지표 — 짧은 기둥 3개(값 없음 = 점선 트랙 + "—"). */
export function IndexBars({ frequency, sentimentVar, topicConc }: IndexBarsProps) {
  const rows: Row[] = [
    { key: "frequency", label: "빈도", weight: "40%", value: clamp(frequency) },
    { key: "sentimentVar", label: "감정 편차", weight: "35%", value: clamp(sentimentVar) },
    { key: "topicConc", label: "주제 집중", weight: "25%", value: clamp(topicConc) },
  ];
  return (
    <dl className="tw-idx" aria-label="온도 구성 3지표">
      {rows.map((r) => {
        // clamp 가 NaN/Infinity 를 null 로 바꿔 두므로 null 만 결측. 0 은 실제 값.
        const missing = r.value == null;
        return (
          <div key={r.key} className="tw-idx-row" data-key={r.key}>
            <dt>
              {r.label} <small className="tw-dim">{r.weight}</small>
            </dt>
            <dd>
              <div
                className={missing ? "tw-idx-track is-dotted" : "tw-idx-track"}
                role="meter"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={r.value ?? 0}
                aria-valuetext={missing ? `${r.label} 자료 없음` : `${r.label} ${Math.round(r.value ?? 0)}`}
              >
                {!missing && (
                  <span className="tw-idx-fill" style={{ ["--w" as string]: `${r.value}%` }} />
                )}
              </div>
            </dd>
            <dd className="tw-idx-val">{missing ? "—" : Math.round(r.value ?? 0)}</dd>
          </div>
        );
      })}
    </dl>
  );
}
