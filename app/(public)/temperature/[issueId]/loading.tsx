// ============================================================================
// /temperature/[issueId] 로딩 — 검은 세계 위 점선 괘선만(시머 없음).
// ============================================================================

import "@/app/temperature.css";

export default function Loading() {
  return (
    <div className="tw tw-loading" aria-busy="true" aria-label="사안 온도 불러오는 중">
      <p className="tw-back">← 공론 온도계</p>
      <p className="tw-eyebrow">공론 온도 · 사안</p>
      <p className="tw-meta">불러오는 중</p>
      <hr className="tw-rule is-dotted" />
      <hr className="tw-rule is-dotted" />
    </div>
  );
}
