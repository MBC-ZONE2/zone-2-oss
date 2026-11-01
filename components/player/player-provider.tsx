"use client";

// ============================================================================
// components/player/player-provider — 전역 오디오 플레이어 (단일 <audio> + Context)
//
// 「일점 지면」의 백색원(듣기)은 하나다. 앱 전체에 <audio> 엘리먼트는 이 Provider 안의
// 것 하나뿐이고, 홈 오디오 슬라이드·데스크탑 보드·팟캐 목록/상세·하단 네비 ▶·
// 바텀 시트는 전부 이 컨텍스트를 읽고 조작하는 리모컨이다. ReelsShell 최상단
// (/admin 분기 밖)에 마운트되므로 페이지를 옮겨도 오디오는 살아 있다.
//
// 담당:
//   - 상태: queue·current·isPlaying·currentTime·duration·rate(+버퍼·오류·이어듣기)
//   - 액션: play(ep)/pause/toggle/seek/skip/cycleRate/setQueue
//   - 회차 시트(바텀업 플레이리스트)는 시범단 #179 로 제거(2026-10-04) — 탭은 최신 회차 재생/일시정지,
//     회차 고르기·대본은 /podcast 에서. 큐(ensureQueue)는 자동 다음 회차용으로 남긴다.
//   - 이어 듣기: localStorage `podcast-pos-{id}` (5초 throttle + pause 시 저장, 같은 회차 재생 시 복원)
//   - 회차 끝 → queue 의 다음 회차 자동 재생
//   - Media Session(title / artist "ZONE-2 오늘의 충북" / play·pause·seekbackward·seekforward)
//   - 재생 카운트(POST /api/podcast/[id]/play) — 실제 재생 시작 시 세션당 회차 1회
//   - 자동 다음 회차(onEnded → 큐 다음 회차)
// 네비 ▶(모바일 #fn-play·데스크톱 #side-play) 상태는
// reels/nav.tsx 가 컨텍스트로 직접 렌더한다(DOM 조회 없음).
// ============================================================================

import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import type { Episode } from "@/types";

/** 플레이어가 필요로 하는 회차 최소 필드 — Episode 전체도 그대로 들어온다(script 는 무시) */
export type PlayerEpisode = Pick<
  Episode,
  "id" | "title" | "audioUrl" | "durationSec" | "publishedAt"
> & {
  /** 대본에서 뽑은 대표 문장(시트 행 부제 폴백). GET /api/podcast?fields=list 가 실어 준다 */
  lead?: string;
  /** 표시용 내용 요약 헤드라인(시트 행 부제, 피그마 #4). 같은 응답이 실어 준다 */
  headline?: string;
};

/** 배속 순환 순서 (0.75 → 1.0 → 1.25 → 1.5 → 0.75 …) */
export const PLAYBACK_RATES = [0.75, 1, 1.25, 1.5] as const;

/** 이 값(초) 미만이면 이어 듣기/저장을 하지 않는다 (도입부 스킵 방지). */
const MIN_RESUME_SEC = 5;
/** 재생 위치 저장 throttle 간격(ms). */
const SAVE_THROTTLE_MS = 5000;
/** ±스킵 기본 초 */
const SKIP_SEC = 15;
/** 시트·자동 다음 회차용 최근 회차 수 */
const QUEUE_LIMIT = 4;
/** 재생 카운트 대상 id 형태(POST 라우트가 UUID 만 받는다) */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type QueueStatus = "idle" | "loading" | "ready" | "error";

export interface PlayerState {
  /** 최근 회차(최신순). 시트 목록이자 자동 다음 회차 순서 */
  queue: PlayerEpisode[];
  queueStatus: QueueStatus;
  current: PlayerEpisode | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  bufferedEnd: number;
  rate: number;
  isBuffering: boolean;
  hasError: boolean;
  /** 복원된 이어 듣기 위치(초). null 이면 안내를 숨긴다. */
  resumeAt: number | null;
  /** 마지막으로 끝까지 재생된 회차(재생 화면의 종료 연출 트리거) */
  lastEnded: { id: string; at: number } | null;
}

export interface PlayerActions {
  /** 단일 <audio> 참조(호환용 — 직접 조작하지 말고 액션을 쓴다) */
  audioRef: RefObject<HTMLAudioElement | null>;
  /** 회차 재생 — 다른 회차면 교체 후 재생, 같은 회차면 이어서 재생 */
  play: (ep: PlayerEpisode) => void;
  pause: () => void;
  /** 현재 회차 재생/일시정지. 현재 회차가 없으면 queue 첫 회차 */
  toggle: () => void;
  seek: (sec: number) => void;
  skip: (delta: number) => void;
  cycleRate: () => void;
  setQueue: (eps: PlayerEpisode[]) => void;
  /** 최근 회차를 1회 로드(이미 있으면 no-op). 실패했으면 다시 시도한다 */
  ensureQueue: () => Promise<void>;
  /** 오류 후 다시 시도 */
  retry: () => void;
  /** 현재 회차를 처음부터(저장 위치 삭제) */
  restartFromZero: () => void;
  dismissResume: () => void;
}

export type PlayerContextValue = PlayerState & PlayerActions;

const PlayerContext = createContext<PlayerContextValue | null>(null);

// ── localStorage 이어 듣기 ────────────────────────────────────────────────
function posKey(episodeId: string): string {
  return `podcast-pos-${episodeId}`;
}

/** 저장된 재생 위치(초) 읽기 — 없거나 무효면 null */
export function readSavedPos(episodeId: string): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(posKey(episodeId));
    if (!raw) return null;
    const n = Number.parseFloat(raw);
    return Number.isFinite(n) && n >= MIN_RESUME_SEC ? n : null;
  } catch {
    return null;
  }
}

/** 재생 위치 저장(5초 미만/무효는 제거) */
function writeSavedPos(episodeId: string, sec: number): void {
  if (typeof window === "undefined") return;
  try {
    if (Number.isFinite(sec) && sec >= MIN_RESUME_SEC) {
      window.localStorage.setItem(posKey(episodeId), String(Math.floor(sec)));
    } else {
      window.localStorage.removeItem(posKey(episodeId));
    }
  } catch {
    // 프라이빗 모드 등 — 조용히 무시
  }
}

/** 저장된 재생 위치 제거 */
export function clearSavedPos(episodeId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(posKey(episodeId));
  } catch {
    // 무시
  }
}

// ── 유틸 ──────────────────────────────────────────────────────────────────
/** 오디오 소스 — 절대 URL 이면 그대로, 아니면 서버 스트리밍 라우트(lib/reels/deck audioSrc 와 동일 규칙) */
export function resolveAudioSrc(ep: Pick<PlayerEpisode, "id" | "audioUrl">): string {
  const u = ep.audioUrl || "";
  if (/^https?:\/\//.test(u)) return u;
  return `/api/podcast/${ep.id}/audio`;
}

/** audio.buffered 의 마지막 구간 끝(초)을 안전하게 읽는다. */
function getBufferedEnd(audio: HTMLAudioElement): number {
  const b = audio.buffered;
  if (!b || b.length === 0) return 0;
  try {
    return b.end(b.length - 1);
  } catch {
    return 0;
  }
}

/** 클램프한 오디오 길이(초) — 메타데이터 없으면 durationSec 폴백 */
function effectiveDuration(audio: HTMLAudioElement | null, fallback: number): number {
  if (audio && Number.isFinite(audio.duration) && audio.duration > 0) return audio.duration;
  return fallback;
}

/** API 응답 → PlayerEpisode (script 등 무거운 필드는 버린다) */
function toPlayerEpisode(raw: unknown): PlayerEpisode | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string") return null;
  return {
    id: r.id,
    title: typeof r.title === "string" ? r.title : "",
    audioUrl: typeof r.audioUrl === "string" ? r.audioUrl : null,
    durationSec: typeof r.durationSec === "number" ? r.durationSec : null,
    publishedAt: typeof r.publishedAt === "string" ? r.publishedAt : null,
    lead: typeof r.lead === "string" ? r.lead : undefined,
    headline: typeof r.headline === "string" ? r.headline : undefined,
  };
}

/** 재생 카운트 — 세션당 회차 1회(자동재생·프리로드·재개로 부풀지 않게). 실패는 무시. */
const countedIds = new Set<string>();
function recordPlay(episodeId: string): void {
  if (!UUID_RE.test(episodeId) || countedIds.has(episodeId)) return;
  countedIds.add(episodeId);
  const key = `zone2.podcast.played.${episodeId}`;
  try {
    if (sessionStorage.getItem(key)) return; // 같은 세션 재생은 중복 카운트 안 함
    sessionStorage.setItem(key, "1");
  } catch {
    /* 저장 불가여도 아래 요청은 보낸다(세션 1회 보장은 countedIds 로도 됨) */
  }
  void fetch(`/api/podcast/${episodeId}/play`, { method: "POST", keepalive: true }).catch(
    () => {},
  );
}

// ── Provider ──────────────────────────────────────────────────────────────
export function PlayerProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [queue, setQueueState] = useState<PlayerEpisode[]>([]);
  const [queueStatus, setQueueStatus] = useState<QueueStatus>("idle");
  const [current, setCurrent] = useState<PlayerEpisode | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferedEnd, setBufferedEnd] = useState(0);
  const [rate, setRate] = useState<number>(1);
  const [isBuffering, setIsBuffering] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [resumeAt, setResumeAt] = useState<number | null>(null);
  const [lastEnded, setLastEnded] = useState<{ id: string; at: number } | null>(null);

  // 이벤트 핸들러가 최신 값을 읽기 위한 ref 거울
  const currentRef = useRef<PlayerEpisode | null>(null);
  const queueRef = useRef<PlayerEpisode[]>([]);
  const lastSaveRef = useRef(0);
  const pendingRestoreRef = useRef<number | null>(null);
  // <audio> 에 실제로 붙어 있는 회차 id — loadstart 시점에 currentRef 를 따라간다. 소스 교체 직후
  // 이전 미디어가 뱉는 pause/timeupdate 는 currentRef(새 회차)와 어긋나므로 저장에서 걸러진다.
  const mediaIdRef = useRef<string | null>(null);
  const queueFetchRef = useRef<Promise<void> | null>(null);
  const playRef = useRef<(ep: PlayerEpisode) => void>(() => {});

  // ── queue ───────────────────────────────────────────────────────────────
  const setQueue = useCallback((eps: PlayerEpisode[]) => {
    queueRef.current = eps;
    setQueueState(eps);
    setQueueStatus("ready");
  }, []);

  const ensureQueue = useCallback((): Promise<void> => {
    if (queueRef.current.length > 0) return Promise.resolve();
    if (queueFetchRef.current) return queueFetchRef.current;
    setQueueStatus("loading");
    const run = (async () => {
      try {
        // fields=list — 시트에 필요한 필드(제목·날짜·길이·오디오)만, 대본 전문 제외
        const res = await fetch(`/api/podcast?limit=${QUEUE_LIMIT}&fields=list`, {
          headers: { Accept: "application/json" },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { data?: { items?: unknown[] } | null };
        const items = (json.data?.items ?? [])
          .map(toPlayerEpisode)
          .filter((e): e is PlayerEpisode => e !== null);
        // 그 사이 setQueue 로 채워졌으면 그쪽을 존중한다
        if (queueRef.current.length === 0) {
          queueRef.current = items;
          setQueueState(items);
        }
        setQueueStatus("ready");
      } catch {
        setQueueStatus("error");
      } finally {
        queueFetchRef.current = null;
      }
    })();
    queueFetchRef.current = run;
    return run;
  }, []);

  // ── queue ───────────────────────────────────────────────────────────────
  // 회차 목록 프리페치 — 재생 원 첫 탭이 바로 울리도록 마운트 1.5초 뒤 미리 받아둔다(자동 다음 회차에도 쓴다).
  // /admin 에서는 생략(관리 화면에서 굳이 목록을 내려받지 않는다 — 탭하면 그때 ensureQueue).
  const isAdmin = pathname?.startsWith("/admin") ?? false;
  useEffect(() => {
    if (isAdmin) return;
    const id = window.setTimeout(() => {
      void ensureQueue();
    }, 1500);
    return () => window.clearTimeout(id);
  }, [ensureQueue, isAdmin]);

  // ── Media Session ───────────────────────────────────────────────────────
  const setMediaMetadata = useCallback((ep: PlayerEpisode) => {
    try {
      if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
      if (typeof MediaMetadata === "undefined") return;
      navigator.mediaSession.metadata = new MediaMetadata({
        // 잠금 화면 제목 = 내용 헤드라인(있으면). 날짜 제목은 앨범·아티스트가 이미 말해 준다
        title: ep.headline?.trim() || ep.title || "오늘의 충북",
        artist: "ZONE-2 오늘의 충북",
        album: "ZONE-2",
      });
    } catch {
      // 미지원 — 무시
    }
  }, []);

  // ── 액션 ────────────────────────────────────────────────────────────────
  const seek = useCallback((sec: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const dur = effectiveDuration(audio, currentRef.current?.durationSec ?? 0);
    const next = Math.min(Math.max(sec, 0), dur > 0 ? dur : sec);
    try {
      audio.currentTime = next;
    } catch {
      // 메타데이터 전 탐색은 무시
    }
    setCurrentTime(next);
  }, []);

  const skip = useCallback(
    (delta: number) => {
      const audio = audioRef.current;
      if (audio) seek(audio.currentTime + delta);
    },
    [seek],
  );

  const play = useCallback(
    (ep: PlayerEpisode) => {
      const audio = audioRef.current;
      if (!audio) return;
      if (currentRef.current?.id !== ep.id) {
        // 회차 교체 전에 이전 회차 위치를 그 회차 키로 직접 저장한다(교체 후 pause 이벤트에 맡기지 않음)
        const prev = currentRef.current;
        if (prev && mediaIdRef.current === prev.id && audio.currentTime > 0) {
          // 끝까지 들은 회차(ended 또는 끝 1초 이내)는 저장하지 않고 지운다 — 자동 이어재생(onEnded→play)이
          // 끝 위치를 다시 써서 clearSavedPos 를 무효화하는 걸 막는다
          const prevDur = effectiveDuration(audio, prev.durationSec ?? 0);
          if (audio.ended || (prevDur > 0 && audio.currentTime >= prevDur - 1)) clearSavedPos(prev.id);
          else writeSavedPos(prev.id, audio.currentTime);
        }
        currentRef.current = ep;
        setCurrent(ep);
        setCurrentTime(0);
        setDuration(ep.durationSec ?? 0);
        setBufferedEnd(0);
        setResumeAt(null);
        setIsBuffering(true);
        lastSaveRef.current = 0;
        pendingRestoreRef.current = readSavedPos(ep.id);
        audio.src = resolveAudioSrc(ep);
        audio.load();
        setMediaMetadata(ep);
        void ensureQueue(); // 자동 다음 회차용(백그라운드)
      }
      setHasError(false);
      const p = audio.play();
      if (p && typeof p.then === "function") {
        p.then(() => recordPlay(ep.id)).catch((err: unknown) => {
          // 재생 직후 pause()/load() 경합 시 브라우저가 AbortError 를 던진다 — 정상 조작
          if (err instanceof DOMException && err.name === "AbortError") return;
          setHasError(true);
          setIsBuffering(false);
        });
      } else {
        recordPlay(ep.id);
      }
    },
    [ensureQueue, setMediaMetadata],
  );
  playRef.current = play;

  const pause = useCallback(() => {
    audioRef.current?.pause();
  }, []);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    const cur = currentRef.current;
    if (cur && audio && !audio.paused) {
      audio.pause();
      return;
    }
    const target = cur ?? queueRef.current.find((e) => Boolean(e.audioUrl)) ?? null;
    if (target) {
      play(target);
      return;
    }
    // 큐가 아직 없다(프리페치 1.5s 전이거나 실패) — 받아서 바로 첫 회차를 튼다.
    // 사용자 제스처 안에서 await 가 끼면 iOS 가 자동재생을 막을 수 있어, 먼저 무음으로 play() 를
    // 건드려 오디오 요소를 "활성화"해 둔다(src 없이는 실패해도 무해).
    try { void audio?.play().catch(() => {}); } catch { /* ignore */ }
    void ensureQueue().then(() => {
      const first = queueRef.current.find((e) => Boolean(e.audioUrl));
      if (first && !currentRef.current) play(first);
    });
  }, [play, ensureQueue]);

  const cycleRate = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const i = PLAYBACK_RATES.indexOf(audio.playbackRate as (typeof PLAYBACK_RATES)[number]);
    const next = PLAYBACK_RATES[(i + 1) % PLAYBACK_RATES.length];
    audio.playbackRate = next;
    setRate(next);
  }, []);

  const retry = useCallback(() => {
    const audio = audioRef.current;
    const cur = currentRef.current;
    if (!audio || !cur) return;
    setHasError(false);
    setIsBuffering(true);
    pendingRestoreRef.current = audio.currentTime >= MIN_RESUME_SEC ? audio.currentTime : null;
    audio.load();
    void audio.play().catch(() => setHasError(true));
  }, []);

  const restartFromZero = useCallback(() => {
    const cur = currentRef.current;
    seek(0);
    setResumeAt(null);
    if (cur) clearSavedPos(cur.id);
  }, [seek]);

  const dismissResume = useCallback(() => setResumeAt(null), []);

  // ── <audio> 이벤트 배선(1회) ─────────────────────────────────────────────
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return undefined;

    // 미디어 이벤트가 난 회차(mediaIdRef)가 현재 회차와 같을 때만 저장 — 소스 교체 잔향은 무시
    const save = (sec: number, force: boolean) => {
      const cur = currentRef.current;
      if (!cur || mediaIdRef.current !== cur.id) return;
      const now = Date.now();
      if (!force && now - lastSaveRef.current < SAVE_THROTTLE_MS) return;
      lastSaveRef.current = now;
      writeSavedPos(cur.id, sec);
    };

    const fallback = () => currentRef.current?.durationSec ?? 0;

    const onLoadedMeta = () => {
      const dur = effectiveDuration(audio, fallback());
      setDuration(dur);
      const restore = pendingRestoreRef.current;
      pendingRestoreRef.current = null;
      if (restore != null && restore < dur - 1) {
        audio.currentTime = restore;
        setCurrentTime(restore);
        setResumeAt(restore);
      }
    };
    const onEnded = () => {
      const cur = currentRef.current;
      setIsPlaying(false);
      setResumeAt(null);
      if (!cur) return;
      clearSavedPos(cur.id);
      setLastEnded({ id: cur.id, at: Date.now() });
      // 다음 회차 자동 재생 — queue 순서에서 오디오가 있는 다음 회차
      const q = queueRef.current;
      const i = q.findIndex((e) => e.id === cur.id);
      if (i < 0) return;
      const next = q.slice(i + 1).find((e) => Boolean(e.audioUrl));
      if (next) playRef.current(next);
    };

    const handlers: Array<[keyof HTMLMediaElementEventMap, () => void]> = [
      // 새 소스 로드 시작 — 이제부터의 이벤트는 currentRef 회차의 것
      ["loadstart", () => { mediaIdRef.current = currentRef.current?.id ?? null; }],
      ["loadedmetadata", onLoadedMeta],
      ["durationchange", () => setDuration(effectiveDuration(audio, fallback()))],
      ["timeupdate", () => { setCurrentTime(audio.currentTime); save(audio.currentTime, false); }],
      ["progress", () => setBufferedEnd(getBufferedEnd(audio))],
      ["play", () => setIsPlaying(true)],
      ["playing", () => { setIsPlaying(true); setIsBuffering(false); }],
      ["pause", () => { setIsPlaying(false); save(audio.currentTime, true); }],
      ["waiting", () => setIsBuffering(true)],
      ["canplay", () => setIsBuffering(false)],
      ["seeked", () => setCurrentTime(audio.currentTime)],
      ["ratechange", () => setRate(audio.playbackRate)],
      ["ended", onEnded],
      ["error", () => { setHasError(true); setIsBuffering(false); setIsPlaying(false); }],
    ];
    handlers.forEach(([evt, fn]) => audio.addEventListener(evt, fn));

    // 탭을 떠날 때 위치 저장
    const onPageHide = () => save(audio.currentTime, true);
    window.addEventListener("pagehide", onPageHide);

    // Media Session 액션 — 잠금 화면·이어폰 버튼
    try {
      if ("mediaSession" in navigator) {
        const ms = navigator.mediaSession;
        ms.setActionHandler("play", () => {
          const cur = currentRef.current;
          if (cur) playRef.current(cur);
        });
        ms.setActionHandler("pause", () => audio.pause());
        ms.setActionHandler("seekbackward", (d) => {
          seek(audio.currentTime - (d.seekOffset ?? SKIP_SEC));
        });
        ms.setActionHandler("seekforward", (d) => {
          seek(audio.currentTime + (d.seekOffset ?? SKIP_SEC));
        });
      }
    } catch {
      // 미지원 — 무시
    }

    return () => {
      handlers.forEach(([evt, fn]) => audio.removeEventListener(evt, fn));
      window.removeEventListener("pagehide", onPageHide);
      try {
        if ("mediaSession" in navigator) {
          const ms = navigator.mediaSession;
          ms.setActionHandler("play", null);
          ms.setActionHandler("pause", null);
          ms.setActionHandler("seekbackward", null);
          ms.setActionHandler("seekforward", null);
        }
      } catch {
        // 무시
      }
    };
  }, [seek]);

  // Media Session 재생 상태
  useEffect(() => {
    try {
      if ("mediaSession" in navigator) {
        navigator.mediaSession.playbackState = current
          ? isPlaying
            ? "playing"
            : "paused"
          : "none";
      }
    } catch {
      // 무시
    }
  }, [isPlaying, current]);

  const value = useMemo<PlayerContextValue>(
    () => ({
      queue,
      queueStatus,
      current,
      isPlaying,
      currentTime,
      duration,
      bufferedEnd,
      rate,
      isBuffering,
      hasError,
      resumeAt,
      lastEnded,
      audioRef,
      play,
      pause,
      toggle,
      seek,
      skip,
      cycleRate,
      setQueue,
      ensureQueue,
      retry,
      restartFromZero,
      dismissResume,
    }),
    [
      queue, queueStatus, current, isPlaying, currentTime, duration, bufferedEnd, rate,
      isBuffering, hasError, resumeAt, lastEnded,
      play, pause, toggle, seek, skip, cycleRate,
      setQueue, ensureQueue, retry, restartFromZero, dismissResume,
    ],
  );

  return (
    <PlayerContext.Provider value={value}>
      {/* 앱 유일의 오디오 엘리먼트 — src 는 play(ep) 가 넣는다 */}
      <audio ref={audioRef} preload="metadata" className="sr-only" aria-hidden />
      {children}
    </PlayerContext.Provider>
  );
}

/** 전역 플레이어 컨텍스트 — PlayerProvider(ReelsShell) 아래에서만 쓴다 */
export function usePlayer(): PlayerContextValue {
  const ctx = useContext(PlayerContext);
  if (!ctx) {
    throw new Error("usePlayer 는 <PlayerProvider> 안에서만 쓸 수 있습니다(ReelsShell 이 마운트).");
  }
  return ctx;
}

/** 진행률 0~1 (네비 진행 링·시트 진행선용) */
export function progressRatio(currentTime: number, duration: number): number {
  return duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0;
}
