"use client";

// ============================================================================
// components/podcast/play-screen — 검은 세계 재생 화면 (/podcast/[id]) (FR-PC-02~05·07)
//
// 바닥 #0b0d12. 머리(뒤로·공유·제목·메타) 아래 인트로 문장 자리(y 138)에 대본이
// 단락 동기로 찍히고(Transcript), 발에 진행선(도로 점선 → 실선)·활자 44px 흰 테두리
// ±15초·배속·백색원 64px 재생/일시정지가 놓인다.
//
// 시그니처 — 백색원(24px 발광 디스크)이 duration 동안 화면 좌→우 완만한 호를 난다.
//   · 궤도 = 2차 베지에(뷰포트 좌표)를 48점 샘플링한 WAAPI transform 키프레임.
//     anim.currentTime 을 오디오 currentTime 에, playbackRate 를 배속에 맞춘다(탐색·배속 동기).
//   · reduced-motion: 비행 없음 — 진행 비율 자리에 순간 이동.
//   · 끝(ended): 우측 벽 충돌 지점에서 백색이 clip-path circle 로 450ms 확장된 뒤
//     종이 목록(/podcast)으로 router.push. reduced-motion 은 즉시 이동.
// 오디오는 전역 PlayerProvider 의 단일 <audio>(여기서 만들지 않음). usePodcastPlayer 는
// 그 리모컨이며 훅 API 는 유지. 종료 연출은 훅의 endedAt 으로 구동한다.
// 데스크탑(≥1100px, podcast.css 끝 블록): 발(.pc-play-foot)이 우 레일 sticky "재생 화면"이
// 된다 — 회차 제목·날짜·길이(.pc-deck-head) → 96px 백색원(.pc-deck-circle) → 폭 전체
// 진행선·시간 → −15초/+15초/배속 행 → 파형(.pc-deck-wave). 데스크탑 전용 조각은
// 모바일에서 display:none, 모바일 컨트롤 행의 백색원은 데스크탑에서 숨긴다(같은 훅 액션).
// ============================================================================

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { usePodcastPlayer } from "./use-podcast-player";
import Waveform from "@/components/ui/waveform";
import { PlayerProgress } from "./player-progress";
import { Transcript } from "./transcript";
import { ShareButton } from "./share-button";
import { NewBadge } from "./new-badge";
import {
  ErrorNotice,
  PendingNotice,
  PlayCircle,
  ResumeBanner,
  TypeControls,
} from "./player-parts";
import { formatDate, formatMinutes, formatPlayerTime } from "./format";
import { region } from "@/config/region";

export interface PlayScreenProps {
  episodeId: string;
  /** 날짜 제목("오늘의 충북 9월 8일") — 플레이어 큐·시트 행의 제목과 같은 값 */
  title: string;
  /** 내용 요약 헤드라인(피그마 #4) — 화면 큰 제목·공유 제목. 없으면 title */
  headline?: string | null;
  script: string | null;
  audioUrl: string | null;
  durationSec: number | null;
  publishedAt: string | null;
  createdAt: string;
}

/** 비행 궤도 — 좌측 밖(-14, 60%h) → 정점(50%w, 36%h) → 우측 벽(w-12, 50%h) */
interface Orbit {
  frames: Keyframe[];
  end: { x: number; y: number };
  /** 진행 비율(0~1) → 좌표(reduced-motion 의 순간 이동용) */
  at: (t: number) => { x: number; y: number };
}
function buildOrbit(vw: number, vh: number): Orbit {
  const x0 = -14;
  const y0 = vh * 0.6;
  const cx = vw * 0.5;
  const cy = vh * 0.36;
  const x1 = vw - 12;
  const y1 = vh * 0.5;
  const at = (t: number) => {
    const u = 1 - t;
    return {
      x: u * u * x0 + 2 * u * t * cx + t * t * x1,
      y: u * u * y0 + 2 * u * t * cy + t * t * y1,
    };
  };
  const N = 48;
  const frames: Keyframe[] = [];
  for (let i = 0; i <= N; i += 1) {
    const p = at(i / N);
    frames.push({ transform: `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)` });
  }
  return { frames, end: { x: x1, y: y1 }, at };
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

const EXPAND_MS = 450;

export function PlayScreen({
  episodeId,
  title,
  headline,
  script,
  audioUrl,
  durationSec,
  publishedAt,
  createdAt,
}: PlayScreenProps) {
  const router = useRouter();
  const p = usePodcastPlayer(episodeId, durationSec, { audioUrl, title, headline, publishedAt });

  const [phase, setPhase] = useState<"play" | "expand">("play");
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);
  const [viewport, setViewport] = useState<{ w: number; h: number } | null>(null);

  const discRef = useRef<HTMLSpanElement>(null);
  const animRef = useRef<Animation | null>(null);
  const orbitRef = useRef<Orbit | null>(null);
  const timeRef = useRef(0);
  timeRef.current = p.currentTime;

  const heading = headline?.trim() || title.trim() || "제목 준비 중";
  const dateLabel = formatDate(publishedAt ?? createdAt);
  const minutes = formatMinutes(durationSec);

  // 뷰포트 크기(궤도 계산용) — 마운트 후·리사이즈
  useEffect(() => {
    const read = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    read();
    window.addEventListener("resize", read);
    return () => window.removeEventListener("resize", read);
  }, []);

  // 궤도 애니메이션 생성 — duration/뷰포트가 바뀌면 다시 만든다(현재 시각으로 이어 붙임)
  useEffect(() => {
    const disc = discRef.current;
    if (!disc || !viewport || !audioUrl) return undefined;
    const orbit = buildOrbit(viewport.w, viewport.h);
    orbitRef.current = orbit;
    if (prefersReducedMotion() || typeof disc.animate !== "function") {
      // 비행 없음 — 진행 비율 자리에 순간 이동(아래 동기 이펙트가 옮긴다)
      animRef.current = null;
      return undefined;
    }
    const anim = disc.animate(orbit.frames, {
      duration: Math.max(1000, (p.duration > 0 ? p.duration : 60) * 1000),
      easing: "linear",
      fill: "both",
    });
    anim.pause();
    anim.currentTime = timeRef.current * 1000;
    animRef.current = anim;
    return () => {
      anim.cancel();
      if (animRef.current === anim) animRef.current = null;
    };
  }, [viewport, p.duration, audioUrl]);

  // 오디오 ↔ 디스크 동기 — 재생/정지·배속·탐색(400ms 이상 어긋나면 맞춘다)
  useEffect(() => {
    const anim = animRef.current;
    const disc = discRef.current;
    const orbit = orbitRef.current;
    if (!disc || !orbit) return;
    if (!anim) {
      const ratio = p.duration > 0 ? Math.min(1, Math.max(0, p.currentTime / p.duration)) : 0;
      const pt = orbit.at(ratio);
      disc.style.transform = `translate(${pt.x.toFixed(1)}px, ${pt.y.toFixed(1)}px)`;
      return;
    }
    if (anim.playbackRate !== p.playbackRate) anim.playbackRate = p.playbackRate;
    const target = p.currentTime * 1000;
    const now = typeof anim.currentTime === "number" ? anim.currentTime : 0;
    if (Math.abs(now - target) > 400) anim.currentTime = target;
    if (p.isPlaying) {
      if (anim.playState !== "running") anim.play();
    } else if (anim.playState === "running") {
      anim.pause();
    }
  }, [p.currentTime, p.isPlaying, p.playbackRate, p.duration]);

  // 끝 — 우측 벽에서 백색 확장 → 종이 목록으로. 전역 플레이어가 이 회차의 종료를
  // endedAt(ms) 으로 알린다(오디오는 Provider 소유). 마운트 이전의 종료는 무시한다.
  const mountedAtRef = useRef(Date.now());
  useEffect(() => {
    if (!p.endedAt || p.endedAt < mountedAtRef.current) return undefined;
    const end = orbitRef.current?.end ?? { x: window.innerWidth - 12, y: window.innerHeight / 2 };
    setOrigin(end);
    setPhase("expand");
    const timer = window.setTimeout(
      () => router.push("/podcast"),
      prefersReducedMotion() ? 30 : EXPAND_MS + 20,
    );
    return () => window.clearTimeout(timer);
  }, [p.endedAt, router]);

  // 키보드: Space=재생/정지, ←/→=15초 스킵. 버튼 자체 클릭엔 위임한다.
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const isButton = (e.target as HTMLElement).tagName === "BUTTON";
    if (e.key === " " || e.key === "Spacebar") {
      if (isButton) return;
      e.preventDefault();
      p.togglePlay();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      p.skip(-15);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      p.skip(15);
    }
  };

  return (
    <div className="pc-play" data-phase={phase} data-disc={audioUrl && viewport ? "on" : "off"}>
      <div className="pc-play-bg" aria-hidden />

      <header className="pc-play-head px-5 sm:px-[76px]">
        <div className="pc-play-top">
          <Link href="/podcast" className="pc-tlink">
            <span aria-hidden>← </span>{region.podcast.seriesName} 편성표
          </Link>
          <ShareButton title={heading} />
        </div>
        <h1>{heading}</h1>
        <p className="pc-meta">
          <Waveform playing={p.isPlaying} className="pc-play-wave" />
          <span className="pc-stamp">AI가 만든</span>
          {dateLabel ? (
            <>
              <span className="pc-sep" aria-hidden>
                ·
              </span>
              <time dateTime={publishedAt ?? createdAt}>{dateLabel}</time>
            </>
          ) : null}
          {minutes ? (
            <>
              <span className="pc-sep" aria-hidden>
                ·
              </span>
              <span>{minutes}</span>
            </>
          ) : null}
          <NewBadge publishedAt={publishedAt} />
        </p>
      </header>

      <div className="pc-script-wrap px-5 sm:px-[76px] flex min-h-0 flex-1 flex-col">
        <Transcript
          script={script}
          currentTime={p.currentTime}
          duration={audioUrl ? p.duration : 0}
          isPlaying={p.isPlaying}
          ariaLabel={`${heading} 대본`}
        />
      </div>

      <div
        role="group"
        aria-label={`${heading} 플레이어`}
        onKeyDown={handleKeyDown}
        className="pc-play-foot px-5 sm:px-[76px]"
      >
        {/* 데스크탑 전용 — 재생 화면 머리(회차 제목·날짜·길이). 모바일은 display:none */}
        <div className="pc-deck-head" aria-hidden>
          <span className="pc-deck-k">지금 재생</span>
          <span className="pc-deck-title">{heading}</span>
          <span className="pc-deck-meta">
            {dateLabel}
            {dateLabel && minutes ? <span className="pc-sep">·</span> : null}
            {minutes}
          </span>
        </div>
        {audioUrl ? (
          <>
            {p.resumeAt != null && (
              <ResumeBanner resumeAt={p.resumeAt} onRestart={p.restartFromZero} onDismiss={p.dismissResume} />
            )}
            {p.hasError && <ErrorNotice onRetry={p.retry} />}
            {/* 데스크탑 전용 96px 백색원 — 모바일 행의 원과 같은 togglePlay(오디오는 Provider) */}
            <div className="pc-deck-circle">
              <PlayCircle isPlaying={p.isPlaying} onToggle={p.togglePlay} />
            </div>
            <PlayerProgress
              tone="black"
              currentTime={p.currentTime}
              duration={p.duration}
              bufferedEnd={p.bufferedEnd}
              isBuffering={p.isBuffering}
              onSeek={p.seekTo}
            />
            <div className="pc-times">
              <span aria-hidden>{formatPlayerTime(p.currentTime)}</span>
              <span aria-hidden>{formatPlayerTime(p.duration)}</span>
            </div>
            <TypeControls
              className="pc-play-ctl"
              playbackRate={p.playbackRate}
              onSkip={p.skip}
              onRate={p.cycleRate}
            >
              <PlayCircle className="pc-m-circle" isPlaying={p.isPlaying} onToggle={p.togglePlay} />
            </TypeControls>
            {/* 데스크탑 전용 파형 — 재생 중이면 흔들린다 */}
            <Waveform playing={p.isPlaying} bars={13} className="pc-deck-wave" />
          </>
        ) : (
          <PendingNotice />
        )}
      </div>

      {/* 발광 디스크 — 뷰포트 전체 레이어, 터치 통과 */}
      <div className="pc-disc-layer" aria-hidden>
        <span className="pc-disc" ref={discRef} />
      </div>

      {/* 끝 — 벽 충돌 지점에서 백색 확장 */}
      {phase === "expand" && (
        <div
          className="pc-white"
          aria-hidden
          style={
            origin
              ? ({ "--fx": `${origin.x}px`, "--fy": `${origin.y}px` } as CSSProperties)
              : undefined
          }
        />
      )}
    </div>
  );
}
