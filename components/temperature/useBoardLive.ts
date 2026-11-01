"use client";

// ============================================================================
// components/temperature/useBoardLive — 온도 보드 라이브 갱신 훅
//
// 갱신 트리거는 둘, 먼저 오는 쪽이 이긴다(FR-TH-04):
//   1) 15분 카운트다운: computedAt + 15분 도달 시 /api/temperature 재조회
//   2) Supabase Realtime: temperature_scores INSERT push 시 디바운스 재조회
// 갱신 실패는 자동 3회 재시도(2초 간격) 후 수동 재시도로 전환한다.
// 성공 시 computedAt 이 바뀌면 "방금 갱신됨" 2초 플래시를 켠다.
// 재조회는 뷰가 쓰는 개수(limit)를 ?limit= 으로 그대로 API 에 넘기고, 응답으로
// 보드를 통째로 교체한다(옛 배치의 행을 남기지 않는다 — 전부 0 인 새 배치도 그대로).
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { TemperatureBoard } from "@/types";

const REFRESH_INTERVAL_MS = 15 * 60 * 1000; // 15분
const MAX_AUTO_RETRIES = 3;
const RETRY_DELAY_MS = 2000;
const FLASH_MS = 2000;
const REALTIME_DEBOUNCE_MS = 800;

export interface BoardLiveState {
  board: TemperatureBoard;
  /** 다음 갱신까지 남은 ms (활성 카운트다운 없으면 null) */
  remainingMs: number | null;
  /** "방금 갱신됨" 플래시 (2초) */
  justUpdated: boolean;
  /** 자동 재시도 소진 후 실패 상태 */
  error: boolean;
  /** 갱신 진행 중 */
  refreshing: boolean;
  /** Realtime 구독 성공 */
  live: boolean;
  /** 수동 재시도 (자동 카운터 리셋 후 재조회) */
  retryNow: () => void;
}

/** computedAt + 15분 데드라인(ms). 무효/빈 보드면 null. */
function deadlineOf(iso: string): number | null {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t) || t <= 0) return null;
  return t + REFRESH_INTERVAL_MS;
}

/** /api/temperature 봉투 → TemperatureBoard (실패 시 null) */
function readBoard(json: unknown): TemperatureBoard | null {
  if (typeof json !== "object" || json === null) return null;
  const data = (json as { data?: unknown }).data;
  if (typeof data !== "object" || data === null) return null;
  const items = (data as { items?: unknown }).items;
  if (!Array.isArray(items)) return null;
  return data as TemperatureBoard;
}

/**
 * 온도 보드 라이브 갱신 상태를 관리한다.
 * @param limit 재조회 시 받을 항목 수(뷰가 그리는 개수 — 서버 초기 보드와 같아야 한다)
 */
export function useBoardLive(initialBoard: TemperatureBoard, limit: number): BoardLiveState {
  const [board, setBoard] = useState(initialBoard);
  const [error, setError] = useState(false);
  const [justUpdated, setJustUpdated] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [live, setLive] = useState(false);
  const [remainingMs, setRemainingMs] = useState<number | null>(null);

  const inflight = useRef(false);
  const autoRetries = useRef(0);
  const firedDeadline = useRef<number | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshRef = useRef<() => void>(() => {});

  const deadline = deadlineOf(board.computedAt);

  const flashUpdated = useCallback(() => {
    setJustUpdated(true);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setJustUpdated(false), FLASH_MS);
  }, []);

  const scheduleRetry = useCallback(() => {
    if (autoRetries.current >= MAX_AUTO_RETRIES) {
      setError(true);
      return;
    }
    autoRetries.current += 1;
    if (retryTimer.current) clearTimeout(retryTimer.current);
    retryTimer.current = setTimeout(() => refreshRef.current(), RETRY_DELAY_MS);
  }, []);

  const refresh = useCallback(async () => {
    if (inflight.current) return;
    inflight.current = true;
    setRefreshing(true);
    try {
      // 초기 보드와 같은 개수를 요청해야 응답이 보드를 통째로 대체할 수 있다.
      const res = await fetch(`/api/temperature?limit=${limit}`, {
        cache: "no-store",
        headers: { accept: "application/json" },
      });
      if (!res.ok) throw new Error(String(res.status));
      const next = readBoard(await res.json());
      if (!next) throw new Error("invalid_payload");
      setError(false);
      autoRetries.current = 0;
      setBoard((prev) => {
        if (next.computedAt !== prev.computedAt) flashUpdated();
        return next;
      });
    } catch {
      scheduleRetry();
    } finally {
      inflight.current = false;
      setRefreshing(false);
    }
  }, [flashUpdated, limit, scheduleRetry]);

  refreshRef.current = refresh;

  const retryNow = useCallback(() => {
    autoRetries.current = 0;
    setError(false);
    void refresh();
  }, [refresh]);

  // 카운트다운 1초 틱 — 데드라인 도달 시 데드라인당 1회만 자동 재조회.
  useEffect(() => {
    if (deadline == null) {
      setRemainingMs(null);
      return;
    }
    const tick = () => {
      const rem = deadline - Date.now();
      setRemainingMs(Math.max(0, rem));
      if (rem <= 0 && firedDeadline.current !== deadline) {
        firedDeadline.current = deadline;
        void refresh();
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [deadline, refresh]);

  // Supabase Realtime — INSERT push 시 디바운스 재조회.
  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel("temperature_board_live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "temperature_scores" },
        () => {
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => void refresh(), REALTIME_DEBOUNCE_MS);
        },
      )
      .subscribe((status) => setLive(status === "SUBSCRIBED"));
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [refresh]);

  // 언마운트 시 잔여 타이머 정리.
  useEffect(
    () => () => {
      if (retryTimer.current) clearTimeout(retryTimer.current);
      if (flashTimer.current) clearTimeout(flashTimer.current);
    },
    [],
  );

  return { board, remainingMs, justUpdated, error, refreshing, live, retryNow };
}
