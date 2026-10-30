"use client";

// ============================================================================
// components/temperature/DotThermometer — 인트로 기하 그대로의 점묘 온도계
//
// 인트로(IdeaConceptVideo.jsx, 무변경·import 금지)의 온도계 상수(TUBE 170/520·폭 50,
// BULB 566/54)와 도트 필터 상수(CELL 10 · DOT_MIN 1.55 · DOT_RANGE 2.85)를 읽어 옮겨
// 적고, 같은 모양을 <canvas> 도트로 재현한다.
//   1) 오프스크린 캔버스에 온도계(구근 심부·관·구근 외곽선·눈금·수은)를 굵게 그린다
//   2) 논리 좌표 10px 격자로 표본을 떠서, 밝을수록 크고 흰 도트(검은 화면 모드)로 찍는다
//      — 색이 있는 곳(수은)은 색조를 지키고 밝기만 인쇄 톤으로 옮긴다
//   3) 수은은 0 에서 목표 온도까지 1.2초 차오른다(outCubic, 스프링 없음).
//      prefers-reduced-motion 이면 즉시 목표값.
// 높이는 CSS(.tw-thermo = 뷰포트 60%)가 정하고 폭은 기하 비율(120:480)로 따라간다.
// 순위 눈금 모드(ticks=12)는 관 옆 눈금을 12등분으로 바꾼다.
// ============================================================================

import { useEffect, useRef } from "react";
import { usePrefersReducedMotion } from "./hooks";

// ── IdeaConceptVideo.jsx 상수의 읽기 전용 사본 ───────────────────────────
const TUBE_TOP = 170;
const TUBE_BOT = 520;
const TUBE_W = 50;
const BULB_Y = 566;
const BULB_R = 54;
const CELL = 10;
const DOT_MIN = 1.55;
const DOT_RANGE = 2.85;
const RED = "#d90429";
const RED_L = "#ff6b5e";

// 논리 박스 — x·y 원점을 10의 배수로 두어 도트 격자 위상(관 테두리 = 열 정중앙)을 지킨다
const BULB_X = 60;
const BOX_W = 120;
const BOX_Y0 = 150;
const BOX_H = 480;
const SS = 2; // 소스(오프스크린) 슈퍼샘플 배율
const FILL_MS = 1200; // 최초 차오름
const UPDATE_MS = 600; // 갱신 시 이동

const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const outCubic = (t: number) => 1 - Math.pow(1 - t, 3);

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** 수은색 원반(구근 심부) — 인트로 mercuryDisc 와 동일 */
function mercuryDisc(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  const g = ctx.createLinearGradient(0, y - r, 0, y + r);
  g.addColorStop(0, RED_L);
  g.addColorStop(1, RED);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

/** 도트 필터의 소스 — 검은 바탕 위에 온도계를 굵게(bold) 그린다. 좌표는 논리 px */
function drawSource(ctx: CanvasRenderingContext2D, level: number, ticks: number) {
  ctx.setTransform(SS, 0, 0, SS, 0, -BOX_Y0 * SS);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, BOX_Y0, BOX_W, BOX_H);

  // 구근 심부(수은 코어)
  mercuryDisc(ctx, BULB_X, BULB_Y, BULB_R - 10);

  // 관 + 구근 외곽선
  ctx.strokeStyle = "rgba(255,255,255,0.6)";
  ctx.lineWidth = 6;
  roundRect(ctx, BULB_X - TUBE_W / 2, TUBE_TOP - 14, TUBE_W, TUBE_BOT - TUBE_TOP + 14, TUBE_W / 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(BULB_X, BULB_Y, BULB_R, 0, Math.PI * 2);
  ctx.stroke();

  // 눈금 — 8등분(온도) 또는 12등분(순위 눈금 모드)
  ctx.strokeStyle = "rgba(255,255,255,0.4)";
  ctx.lineWidth = 3;
  const major = ticks === 12 ? 3 : 4;
  for (let i = 0; i <= ticks; i++) {
    const y = lerp(TUBE_BOT, TUBE_TOP, i / ticks);
    ctx.beginPath();
    ctx.moveTo(BULB_X - TUBE_W / 2 - 14 - (i % major === 0 ? 10 : 0), y);
    ctx.lineTo(BULB_X - TUBE_W / 2 - 8, y);
    ctx.stroke();
  }

  // 수은주
  if (level > 0.001) {
    const mercTop = lerp(TUBE_BOT, TUBE_TOP + 8, Math.min(level, 1.04));
    const mg = ctx.createLinearGradient(0, TUBE_TOP, 0, TUBE_BOT);
    mg.addColorStop(0, RED_L);
    mg.addColorStop(1, RED);
    ctx.fillStyle = mg;
    roundRect(
      ctx,
      BULB_X - TUBE_W / 2 + 8,
      mercTop,
      TUBE_W - 16,
      TUBE_BOT - mercTop + 20,
      (TUBE_W - 16) / 2,
    );
    ctx.fill();
  }
}

/** 소스를 10px 격자로 표본 떠 도트로 찍는다(검은 화면 모드: 밝을수록 크고 흰 점) */
function drawDots(
  ctx: CanvasRenderingContext2D,
  src: CanvasRenderingContext2D,
  scale: number,
) {
  const Wm = BOX_W * SS;
  const Hm = BOX_H * SS;
  const d = src.getImageData(0, 0, Wm, Hm).data;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.clearRect(0, 0, BOX_W, BOX_H);
  const TAU = Math.PI * 2;
  let lastKey = "";
  for (let y = CELL / 2; y < BOX_H; y += CELL) {
    for (let x = CELL / 2; x < BOX_W; x += CELL) {
      // 셀 중심 주변 2×2 픽셀 평균 — AA 노이즈 제거
      const xf = (x * SS) | 0;
      const yf = (y * SS) | 0;
      let rs = 0;
      let gs = 0;
      let bs = 0;
      for (const px of [xf - 1, xf]) {
        for (const py of [yf - 1, yf]) {
          const j = (py * Wm + px) * 4;
          rs += d[j];
          gs += d[j + 1];
          bs += d[j + 2];
        }
      }
      rs /= 4;
      gs /= 4;
      bs /= 4;
      const luma = (0.2126 * rs + 0.7152 * gs + 0.0722 * bs) / 255;
      // 채도(수은)는 밝기가 낮아도 살린다 — 색조는 지키고 크기·톤만 인쇄 톤으로
      const mx = Math.max(rs, gs, bs);
      const mn = Math.min(rs, gs, bs);
      const chroma = (mx - mn) / 255;
      const lk = Math.max((luma - 0.08) / 0.92, chroma);
      if (lk <= 0) continue;
      const r = DOT_MIN + DOT_RANGE * Math.pow(lk, 0.9);
      if (r < 0.45) continue;
      const tone = lerp(90, 255, lk);
      const sc = tone / Math.max(mx, 1);
      const cr = Math.min(255, Math.round(rs * sc));
      const cg = Math.min(255, Math.round(gs * sc));
      const cb = Math.min(255, Math.round(bs * sc));
      const key = `${cr >> 3},${cg >> 3},${cb >> 3}`;
      if (key !== lastKey) {
        ctx.fillStyle = `rgb(${cr},${cg},${cb})`;
        lastKey = key;
      }
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU); // 캔버스 좌표 = 소스 좌표(둘 다 박스 상단 원점)
      ctx.fill();
    }
  }
}

export interface DotThermometerProps {
  /** 수은 높이 0~1 (온도/100). 순위 눈금 모드에서는 0 */
  level: number;
  /** 눈금 등분 — 8(온도) 또는 12(순위 눈금 모드) */
  ticks?: 8 | 12;
  /** 스크린리더용 설명 */
  label: string;
  className?: string;
}

/** 점묘 온도계 캔버스. 크기는 부모(.tw-thermo)의 높이를 따른다. */
export function DotThermometer({ level, ticks = 8, label, className }: DotThermometerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduced = usePrefersReducedMotion();
  const shownRef = useRef(0); // 현재 화면에 찍힌 수은 높이
  const rafRef = useRef(0);
  const srcRef = useRef<HTMLCanvasElement | null>(null);
  const firstRef = useRef(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    if (!srcRef.current) {
      const src = document.createElement("canvas");
      src.width = BOX_W * SS;
      src.height = BOX_H * SS;
      srcRef.current = src;
    }
    const src = srcRef.current;
    const sctx = src.getContext("2d", { willReadFrequently: true });
    if (!sctx) return undefined;

    let cssH = 0;
    let scale = 1;
    const fit = () => {
      const h = canvas.parentElement?.clientHeight ?? 0;
      if (h <= 0 || h === cssH) return false;
      cssH = h;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const cssW = (h * BOX_W) / BOX_H;
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${h}px`;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(h * dpr);
      scale = (h / BOX_H) * dpr;
      return true;
    };
    const paint = (lv: number) => {
      drawSource(sctx, lv, ticks);
      drawDots(ctx, sctx, scale);
    };

    fit();
    const target = clamp01(level);
    cancelAnimationFrame(rafRef.current);
    const from = firstRef.current ? 0 : shownRef.current;
    const dur = firstRef.current ? FILL_MS : UPDATE_MS;
    firstRef.current = false;
    if (reduced || from === target) {
      shownRef.current = target;
      paint(target);
    } else {
      const t0 = performance.now();
      const tick = (now: number) => {
        const t = clamp01((now - t0) / dur);
        const lv = lerp(from, target, outCubic(t));
        shownRef.current = lv;
        paint(lv);
        if (t < 1) rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    }

    // 높이 변화(회전·큰글씨) 추종 — 현재 수은 높이로 다시 찍는다
    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            if (fit()) paint(shownRef.current);
          })
        : null;
    if (ro && canvas.parentElement) ro.observe(canvas.parentElement);
    return () => {
      cancelAnimationFrame(rafRef.current);
      ro?.disconnect();
    };
  }, [level, ticks, reduced]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      role="img"
      aria-label={label}
      width={BOX_W}
      height={BOX_H}
    />
  );
}
