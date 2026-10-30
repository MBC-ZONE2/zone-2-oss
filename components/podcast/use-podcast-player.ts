"use client";

// ============================================================================
// components/podcast/use-podcast-player — 팟캐 플레이어 리모컨 훅 (FR-PC-02·03·07)
//
// 예전엔 이 훅이 <audio> 를 직접 소유했지만, 이제 오디오는 전역 PlayerProvider
// (components/player) 의 단일 엘리먼트 하나뿐이다. 이 훅은 "특정 회차(episodeId)"의
// 시점에서 그 전역 상태를 읽고 조작하는 리모컨이다:
//   - 그 회차가 current 가 아니면 정지 상태를 보고한다(currentTime 은 저장된 이어 듣기
//     위치, resumeAt 안내 포함). togglePlay 하면 Provider.play(그 회차) 로 교체 재생.
//   - current 면 Provider 값을 그대로 돌려준다.
// 반환 필드(PodcastPlayer)는 podcast-player.tsx·play-screen.tsx 가 그대로 쓴다.
// 네비 백색원(#fn-play) 동기는 Provider/nav 로 일원화됐다(여기 없음).
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import type { RefObject } from "react";
import {
  clearSavedPos,
  readSavedPos,
  usePlayer,
  type PlayerEpisode,
} from "@/components/player/player-provider";

export { PLAYBACK_RATES } from "@/components/player/player-provider";

export interface PodcastPlayer {
  audioRef: RefObject<HTMLAudioElement | null>;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  bufferedEnd: number;
  playbackRate: number;
  isBuffering: boolean;
  hasError: boolean;
  /** 복원된 이어 듣기 위치(초). null 이면 안내 배너를 숨긴다. */
  resumeAt: number | null;
  /** 이 회차가 current 로 재생 중/대기 중인지 */
  isCurrent: boolean;
  /** 이 회차가 끝까지 재생된 시각(ms). 0 이면 없음 — 재생 화면 종료 연출 트리거 */
  endedAt: number;
  togglePlay: () => void;
  skip: (delta: number) => void;
  seekTo: (sec: number) => void;
  cycleRate: () => void;
  retry: () => void;
  restartFromZero: () => void;
  dismissResume: () => void;
}

/** 회차 메타 — Provider.play(ep) 에 넘길 재료(audioUrl 없으면 서버 스트리밍 라우트로 폴백) */
export interface PodcastPlayerMeta {
  audioUrl?: string | null;
  /** 날짜 제목("오늘의 충북 9월 8일") — 큐·시트 행 제목. 헤드라인을 여기 넣지 말 것 */
  title?: string;
  /** 내용 요약 헤드라인 — 잠금 화면(Media Session)·now-line 폴백에 쓴다 */
  headline?: string | null;
  publishedAt?: string | null;
}

/**
 * 팟캐스트 플레이어 리모컨 훅.
 * @param episodeId 회차 id(재생 위치 저장 키)
 * @param durationSec 메타데이터 로드 전 폴백 길이
 * @param meta 회차 메타(audioUrl·title·publishedAt) — Provider 에 넘길 때 쓴다
 */
export function usePodcastPlayer(
  episodeId: string,
  durationSec?: number | null,
  meta?: PodcastPlayerMeta,
): PodcastPlayer {
  const player = usePlayer();
  const fallbackDuration = durationSec ?? 0;
  const isCurrent = player.current?.id === episodeId;

  const metaTitle = meta?.title;
  const metaHeadline = meta?.headline ?? undefined;
  const metaAudioUrl = meta?.audioUrl;
  const metaPublishedAt = meta?.publishedAt;
  const ep = useMemo<PlayerEpisode>(
    () => ({
      id: episodeId,
      title: metaTitle ?? "오늘의 충북",
      headline: metaHeadline,
      audioUrl: metaAudioUrl ?? null,
      durationSec: durationSec ?? null,
      publishedAt: metaPublishedAt ?? null,
    }),
    [episodeId, durationSec, metaTitle, metaHeadline, metaAudioUrl, metaPublishedAt],
  );

  // current 가 아닐 때의 이어 듣기 안내 — 저장된 위치(마운트 시 1회 읽음, 닫기 가능)
  const [localResume, setLocalResume] = useState<number | null>(null);
  useEffect(() => {
    setLocalResume(readSavedPos(episodeId));
  }, [episodeId]);

  const togglePlay = useCallback(() => {
    if (isCurrent) player.toggle();
    else player.play(ep);
  }, [isCurrent, player, ep]);

  const seekTo = useCallback(
    (sec: number) => {
      if (isCurrent) player.seek(sec);
    },
    [isCurrent, player],
  );

  const skip = useCallback(
    (delta: number) => {
      if (isCurrent) player.skip(delta);
    },
    [isCurrent, player],
  );

  const cycleRate = useCallback(() => player.cycleRate(), [player]);

  const retry = useCallback(() => {
    if (isCurrent) player.retry();
    else player.play(ep);
  }, [isCurrent, player, ep]);

  const restartFromZero = useCallback(() => {
    if (isCurrent) player.restartFromZero();
    else clearSavedPos(episodeId);
    setLocalResume(null);
  }, [isCurrent, player, episodeId]);

  const dismissResume = useCallback(() => {
    if (isCurrent) player.dismissResume();
    setLocalResume(null);
  }, [isCurrent, player]);

  const endedAt = player.lastEnded?.id === episodeId ? player.lastEnded.at : 0;

  if (isCurrent) {
    return {
      audioRef: player.audioRef,
      isPlaying: player.isPlaying,
      currentTime: player.currentTime,
      duration: player.duration > 0 ? player.duration : fallbackDuration,
      bufferedEnd: player.bufferedEnd,
      playbackRate: player.rate,
      isBuffering: player.isBuffering,
      hasError: player.hasError,
      resumeAt: player.resumeAt,
      isCurrent: true,
      endedAt,
      togglePlay,
      skip,
      seekTo,
      cycleRate,
      retry,
      restartFromZero,
      dismissResume,
    };
  }

  // 정지 상태 — 저장된 위치가 있으면 그 자리에서 이어 듣기 안내
  const saved =
    localResume != null && (fallbackDuration <= 0 || localResume < fallbackDuration - 1)
      ? localResume
      : null;
  return {
    audioRef: player.audioRef,
    isPlaying: false,
    currentTime: saved ?? 0,
    duration: fallbackDuration,
    bufferedEnd: 0,
    playbackRate: player.rate,
    isBuffering: false,
    hasError: false,
    resumeAt: saved,
    isCurrent: false,
    endedAt,
    togglePlay,
    skip,
    seekTo,
    cycleRate,
    retry,
    restartFromZero,
    dismissResume,
  };
}
