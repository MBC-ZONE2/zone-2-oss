"use client";

// ============================================================================
// components/temperature/TemperatureLegend — 온도 구간 범례 (검은 세계, 활자 + 점)
//
// 5구간(잠잠/미온/보통/뜨거움/매우 뜨거움) 설명 + 필수 안내문구를 펼침 패널로 제공한다.
// 구간 목록·안내문구는 BandList.tsx 공용(추이 차트 범례·히어로 안내와 같은 소스).
// 접근성: 버튼 aria-expanded/-controls, Esc·바깥 클릭 닫기, role="dialog".
// 스타일: app/temperature.css(.tw-legend*)
// ============================================================================

import { useEffect, useId, useRef, useState } from "react";
import { BandList, BAND_NOTICE } from "./BandList";

/** 범례 — "온도 구간이란" 활자 버튼으로 5구간 설명을 연다. */
export function TemperatureLegend() {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="tw-legend">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label="온도 구간 안내"
        onClick={() => setOpen((o) => !o)}
        className="tw-legend-btn"
      >
        온도 구간이란
      </button>
      {open && <LegendPanel id={panelId} />}
    </div>
  );
}

/** 범례 본문 (구간 목록 + 안내문구). */
function LegendPanel({ id }: { id: string }) {
  return (
    <div id={id} role="dialog" aria-label="온도 구간 범례" className="tw-legend-panel">
      <p className="tw-eyebrow">온도 구간</p>
      <BandList />
      <hr className="tw-rule" style={{ margin: "12px 0" }} />
      <p className="tw-note">{BAND_NOTICE}</p>
    </div>
  );
}
