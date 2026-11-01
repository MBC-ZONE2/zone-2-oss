"use client";
// 공개 리포 스텁 — 원본 컨셉 영상(캔버스 애니메이션)은 컨소시엄 저작물이라 포함하지 않는다.
// config/region.ts 의 site.intro=false 로 인트로가 꺼져 있어 이 컴포넌트는 마운트되지 않는다. 자기 지역판의 인트로를 여기에 구현하면 된다.
import { useEffect } from "react";
export default function IdeaConceptVideo(props) {
  const { onComplete } = props; // 원본과 같은 props(playing·onComplete)를 받되 아무것도 그리지 않고 바로 완료를 알린다
  useEffect(() => { onComplete?.(); }, [onComplete]);
  return null;
}
