"use client";
// 브랜드 영상 다시 보기 — public/brand/zone2-brand-video.mp4 를 오버레이로 재생.
// "인트로 다시 보기"는 "오늘 하루 안보기" 플래그를 지우고 홈으로 보내 인트로를 재생시킨다.
import { useState } from "react";
import { HIDE_TODAY_KEY } from "./brand-intro";
import { region } from "@/config/region";

export default function BrandVideoButton() {
  const [open, setOpen] = useState(false);

  const replayIntro = () => {
    try {
      // "오늘 하루 안보기"가 켜져 있어도 즉시 다시 보도록 억제 플래그를 지운다.
      window.localStorage.removeItem(HIDE_TODAY_KEY);
    } catch {
      /* noop */
    }
    window.location.href = "/";
  };

  return (
    <>
      <div className="s-actions">
        {region.site.brandVideo ? (
          <button type="button" className="btn" onClick={() => setOpen(true)}>
            브랜드 영상 보기
          </button>
        ) : null}
        {region.site.intro ? (
          <button type="button" className="btn" onClick={replayIntro}>
            인트로 다시 보기
          </button>
        ) : null}
      </div>
      {open && region.site.brandVideo && (
        <div className="bv-backdrop" onClick={() => setOpen(false)}>
          <div className="bv-frame" onClick={(e) => e.stopPropagation()}>
            <video
              src={region.site.brandVideo}
              controls
              autoPlay
              playsInline
              onEnded={() => setOpen(false)}
            />
            <button
              type="button"
              className="bv-close"
              onClick={() => setOpen(false)}
              aria-label="닫기"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </>
  );
}
