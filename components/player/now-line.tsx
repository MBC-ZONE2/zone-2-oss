"use client";

// ============================================================================
// components/player/now-line — 「지금 읽는 단락」 한 줄 (검토 의견 [팟캐스트 1])
//
// 회차가 걸려 있고(재생·일시정지) 현재 경로가 회차 화면(/podcast/[id])이 아닐 때,
// 현재 단락 텍스트를 한 줄로 찍는다. 두 자리(둘 다 같은 훅 useNowLine 을 읽는다):
//   - <NowLineBand> : 모바일(<1100) 하단 float-nav 바로 위 검은 띠 44px, 17px 흰 활자.
//                     좌 파형 + 단락 한 줄 말줄임 + 우 "회차 보기 →". ReelsShell 이 마운트.
//                     보이는 동안 <html data-now-line> 을 세워 reels.css 가 하단 여백에 44px 을 더한다.
//   - <NowLineDock> : 데스크탑(≥1100) 사이드 레일 도크(#side-play 옆 활자) 아래 15px 한 줄.
//                     SideNav(reels/nav.tsx)가 마운트. 고정 띠 대신.
// 단락 계산 = components/podcast/script (splitScript / paragraphStarts / paragraphIndexAt,
// 글자수 비례 추정). 대본은 회차별 1회 fetch(GET /api/podcast/[id] — published 만, anon RLS)
// 후 모듈 LRU 캐시(8개). 실패·대본 없음이면 제목만. 정지(회차 없음)면 아무것도 그리지 않는다.
// 숨김 조건(codex 리뷰): 오디오 없는 회차(audioUrl 없음)·재생 오류(hasError)·끝까지 재생돼
// 다음 회차 자동 재생이 없는 상태(lastEnded == current 이고 정지) — "일시정지"로 오표시하지 않는다.
// fetch 는 띠가 안 보이는 경로(/podcast/[id] 현재 회차 상세·/admin)에서는 시작하지 않고,
// 언마운트·회차 변경 시 AbortController 로 취소한다(같은 회차를 띠·도크가 같이 구독하면 1회만).
// 접근성: aria-live 없음(매 단락 낭독 방지) — role 없는 일반 링크. 전환 애니메이션 없음(찍힘).
// 스타일: app/player.css (.now-line / .now-dock).
// ============================================================================

import "@/app/player.css";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import Waveform from "@/components/ui/waveform";
import { paragraphIndexAt, paragraphStarts, splitScript } from "@/components/podcast/script";
import { usePlayer, type PlayerEpisode } from "./player-provider";

/** 대본 캐시 상한 — 최근 사용 8개만(LRU). 초과하면 가장 오래된 회차부터 버린다 */
const CACHE_LIMIT = 8;
/** 회차 id → 단락 배열(성공한 응답만 캐시. 실패는 캐시하지 않아 다음 재생 시작 때 다시 시도) */
const paragraphCache = new Map<string, string[]>();

/** LRU 조회 — 히트면 맨 뒤로 옮겨 "최근 사용"으로 표시 */
function cacheGet(id: string): string[] | undefined {
  const hit = paragraphCache.get(id);
  if (hit === undefined) return undefined;
  paragraphCache.delete(id);
  paragraphCache.set(id, hit);
  return hit;
}

/** LRU 저장 — 상한 초과면 가장 오래된(맨 앞) 항목 제거 */
function cacheSet(id: string, paras: string[]): void {
  paragraphCache.delete(id);
  paragraphCache.set(id, paras);
  while (paragraphCache.size > CACHE_LIMIT) {
    const oldest = paragraphCache.keys().next().value;
    if (oldest === undefined) break;
    paragraphCache.delete(oldest);
  }
}

/** 진행 중인 fetch — 같은 회차를 두 자리(띠·도크)가 동시에 요청해도 1회만. refs 가 0 이 되면 실제 취소 */
interface InflightJob {
  promise: Promise<string[]>;
  controller: AbortController;
  /** 아직 결과를 기다리는 구독자 수 */
  refs: number;
}
const inflight = new Map<string, InflightJob>();

/**
 * 대본 1회 로드 → 단락 배열. 실패·대본 없음·취소는 [] (호출부가 제목으로 폴백).
 * signal: 호출부(effect)의 취소 신호 — 모든 구독자가 취소하면 네트워크 요청도 중단한다.
 */
function loadParagraphs(id: string, signal: AbortSignal): Promise<string[]> {
  const hit = cacheGet(id);
  if (hit) return Promise.resolve(hit);
  if (signal.aborted) return Promise.resolve([]);
  let job = inflight.get(id);
  if (!job) {
    const controller = new AbortController();
    const created: InflightJob = { controller, refs: 0, promise: Promise.resolve([]) };
    created.promise = (async () => {
      try {
        const res = await fetch(`/api/podcast/${encodeURIComponent(id)}`, {
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { data?: { script?: string | null } | null };
        const paras = splitScript(json.data?.script);
        cacheSet(id, paras);
        return paras;
      } catch {
        return [];
      } finally {
        // 취소 뒤 같은 회차로 새 job 이 생겼을 수 있으니 내 것일 때만 지운다
        if (inflight.get(id) === created) inflight.delete(id);
      }
    })();
    inflight.set(id, created);
    job = created;
  }
  const active = job;
  active.refs += 1;
  signal.addEventListener(
    "abort",
    () => {
      active.refs -= 1;
      if (active.refs <= 0) active.controller.abort();
    },
    { once: true },
  );
  return active.promise;
}

/** 한 줄용 — 줄바꿈·연속 공백을 한 칸으로 */
function oneLine(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

export interface NowLineData {
  ep: PlayerEpisode;
  /** 회차 화면 경로 */
  href: string;
  /** 현재 단락(없으면 회차 제목) */
  text: string;
  /** 일시정지 중 */
  paused: boolean;
}

/**
 * 지금 읽는 단락 — 회차가 없거나 회차 화면(/podcast/[id]) 위에 있으면 null.
 * 단락 번호는 currentTime 이 바뀔 때마다(timeupdate ≈ 4Hz) 다시 고른다(가벼운 선형 탐색).
 */
export function useNowLine(): NowLineData | null {
  const pathname = usePathname() ?? "/";
  const { current, isPlaying, currentTime, duration, hasError, lastEnded } = usePlayer();
  const id = current?.id ?? null;
  const [paras, setParas] = useState<string[]>([]);

  // 띠가 그려지지 않는 경로 — 현재 회차 상세(/podcast/[id])·관리 화면. 여기서는 fetch 를 시작하지 않는다
  const href = id ? `/podcast/${id}` : null;
  const hiddenPath = href !== null && (pathname === href || pathname.startsWith("/admin"));
  // 오디오 없는 회차(스트리밍 경로만 만들어졌을 뿐 실제 파일 없음) — 띠도, 대본 fetch 도 없다
  const noAudio = current !== null && !current.audioUrl;

  // 회차가 바뀌면(= 재생 시작) 대본을 1회 받는다. 캐시 히트면 즉시. 언마운트·회차 변경이면 취소.
  useEffect(() => {
    if (!id) {
      setParas([]);
      return undefined;
    }
    const hit = cacheGet(id);
    if (hit) {
      setParas(hit);
      return undefined;
    }
    setParas([]);
    if (hiddenPath || noAudio) return undefined; // 안 보이는 경로 — 보이는 경로로 옮기면 그때 받는다
    const ac = new AbortController();
    void loadParagraphs(id, ac.signal).then((p) => {
      if (!ac.signal.aborted) setParas(p);
    });
    return () => ac.abort();
  }, [id, hiddenPath, noAudio]);

  const starts = useMemo(() => paragraphStarts(paras, duration), [paras, duration]);

  if (!current || !href) return null;
  if (hiddenPath || noAudio) return null;
  // 재생 오류(404 등) — "일시정지"가 아니므로 띠 없음
  if (hasError) return null;
  // 끝까지 재생됐고 다음 회차 자동 재생이 없으면(current 가 그대로) 마지막 단락 띠를 영구히 남기지 않는다.
  // 같은 회차를 다시 재생하면 isPlaying 이 서고, 처음부터 다시 도는 동안엔 currentTime 이 끝에서 멀다.
  const atEnd = duration <= 0 || currentTime >= duration - 1;
  if (!isPlaying && lastEnded?.id === current.id && atEnd) return null;

  // duration 을 아직 모르면(메타데이터 전) 첫 단락
  const idx = paras.length === 0 ? -1 : duration > 0 ? paragraphIndexAt(starts, currentTime) : 0;
  const para = idx >= 0 ? oneLine(paras[idx] ?? "") : "";
  const text = para || current.headline?.trim() || current.title.trim() || "오늘의 충북";
  return { ep: current, href, text, paused: !isPlaying };
}

/** 모바일 하단 띠 — float-nav 바로 위(ReelsShell 마운트). 데스크탑(≥1100)은 CSS 로 숨김 */
export function NowLineBand() {
  const now = useNowLine();
  const on = now !== null;

  // 띠가 보이는 동안 html[data-now-line] — reels.css 하단 여백 +44px
  useEffect(() => {
    if (!on) return undefined;
    const root = document.documentElement;
    root.setAttribute("data-now-line", "");
    return () => root.removeAttribute("data-now-line");
  }, [on]);

  if (!now) return null;
  return (
    <Link href={now.href} className={now.paused ? "now-line is-paused" : "now-line"}>
      <Waveform playing={!now.paused} bars={5} className="now-line-wave" />
      <span className="now-line-text">
        {now.paused ? <em>일시정지</em> : null}
        {now.text}
      </span>
      <span className="now-line-cta">회차 보기 →</span>
    </Link>
  );
}

/** 데스크탑 사이드 레일 도크 아래 한 줄(SideNav 마운트) — 15px, 말줄임, 화살표 */
export function NowLineDock() {
  const now = useNowLine();
  if (!now) return null;
  return (
    <Link href={now.href} className={now.paused ? "now-dock is-paused" : "now-dock"} title={now.text}>
      <span className="now-dock-text">
        {now.paused ? <em>일시정지 · </em> : null}
        {now.text}
      </span>
      <span className="now-dock-cta" aria-hidden="true">→</span>
      <span className="sr-only">회차 보기</span>
    </Link>
  );
}
