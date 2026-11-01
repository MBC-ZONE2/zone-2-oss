// ============================================================================
// /temperature 로딩 — 검은 세계 위 점선 괘선만(시머 없음). 데이터가 도착하면
// 같은 자리의 괘선이 실선으로 이어진다(기획안 (6) 로딩).
// ============================================================================

import "@/app/temperature.css";

export default function Loading() {
  return (
    <div className="tw tw-loading" aria-busy="true" aria-label="온도계 불러오는 중">
      <p className="tw-eyebrow">ZONE-2 · 공론 온도계</p>
      <h1 className="tw-mast">지금 뜨거운 사안</h1>
      <p className="tw-meta">불러오는 중</p>
      <hr className="tw-rule is-dotted" />
      <hr className="tw-rule is-dotted" />
      <hr className="tw-rule is-dotted" />
    </div>
  );
}
