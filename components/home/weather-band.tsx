"use client";

// ============================================================================
// components/home/weather-band — 공론 기상도 밴드 (온도 섹션의 새 형태)
//
// 데이터 일간지 1면 상단의 풀와이드 스트립. 좌측 리드(소형캡 + 한 줄 설명 +
// 갱신 시각) + 우측 이슈 8칸 그리드. 각 칸: 구간색을 입힌 세리프 대형 온도
// 숫자(30px) · 이슈명 · 구간 라벨(배경 없는 텍스트 + 작은 색 도트). 칸 사이는
// hairline(gap-px + bg-line), 밴드 자체는 하단 단일 헤어라인으로 닫는다.
//
// 기존 온도 섹션의 라이브 로직을 그대로 계승한다:
//   - 15분 폴링(/api/temperature)으로 온도만 갱신. 폴링은 TOP5 만 오므로 해당
//     칸만 제자리 갱신하고 나머지 칸(6~8위)은 유지한다(그리드 8칸 안정 유지).
//   - 값이 실제 변한 칸은 라이브 펄스 1회(z2-temp-pulse), 숫자는 countUp.
//   - prefers-reduced-motion 시 애니메이션 없이 즉시 반영. 초기값은 즉시 렌더.
// 각 칸 → /temperature/[issueId] (issueId 없으면 /temperature).
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { TemperatureBoard, TemperatureBoardItem } from "@/types";
import { bandForTemperature } from "@/lib/temperature/formula";
import { formatDateTime } from "./format";
import { usePrefersReducedMotion, useCountUp } from "./hooks";

const POLL_INTERVAL_MS = 15 * 60 * 1000; // 15분

interface WeatherBandProps {
  initialItems: TemperatureBoardItem[];
  initialComputedAt: string | null;
}

/** 온도값을 0~100 으로 보정 */
function clampTemp(temperature: number): number {
  if (!Number.isFinite(temperature)) return 0;
  return Math.min(100, Math.max(0, temperature));
}

/** /api/temperature 봉투에서 TemperatureBoard 를 안전 추출 (실패 시 null) */
function readBoard(json: unknown): TemperatureBoard | null {
  if (typeof json !== "object" || json === null) return null;
  const data = (json as { data?: unknown }).data;
  if (typeof data !== "object" || data === null) return null;
  const items = (data as { items?: unknown }).items;
  if (!Array.isArray(items)) return null;
  return data as TemperatureBoard;
}

/**
 * 15분 폴링 + 재연결 시 즉시 재조회. 실패는 조용히 흡수(기존 데이터 유지).
 * onBoard 는 안정 참조(useCallback)여야 한다.
 */
function useTemperatureLiveData(onBoard: (board: TemperatureBoard) => void) {
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await fetch("/api/temperature", {
          headers: { accept: "application/json" },
          cache: "no-store",
        });
        if (!res.ok) return;
        const board = readBoard(await res.json());
        if (active && board) onBoard(board);
      } catch {
        // 네트워크 오류 등은 무시 — 다음 주기/재연결에 재시도
      }
    };
    const timer = setInterval(load, POLL_INTERVAL_MS);
    window.addEventListener("online", load);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("online", load);
    };
  }, [onBoard]);
}

/** 기상도 한 칸 — 구간색 countUp 대형 숫자 + 이슈명 + 구간 라벨(색 도트) */
function WeatherCell({
  item,
  reduced,
  pulseKey,
}: {
  item: TemperatureBoardItem;
  reduced: boolean;
  /** 값이 실제 변할 때 증가. 변경 시 remount 로 펄스 1회 재생 */
  pulseKey: number;
}) {
  const target = clampTemp(item.temperature);
  const display = useCountUp(target, reduced);
  const band = bandForTemperature(target);
  const label = item.issue?.label?.trim() || "이슈 준비 중";
  const targetRounded = Math.round(target);
  const href = item.issueId ? `/temperature/${item.issueId}` : "/temperature";

  return (
    <li className="relative bg-surface">
      {!reduced && pulseKey > 0 ? (
        <span key={pulseKey} aria-hidden className="z2-temp-pulse" />
      ) : null}
      <Link
        href={href}
        aria-label={`${label} ${targetRounded}도 ${band.label}`}
        className="relative flex h-full flex-col px-3 pb-3 pt-3 transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-action"
      >
        {/* 온도 숫자는 구간색의 "잉크 변형"(-ink 토큰)으로 — 파스텔 원색은
            밝은 배경 위 텍스트 대비(≥3:1)가 안 나와 진한 톤을 쓴다(교차 확인).
            colorVar 는 "var(--temp-N)" 형태라 접미사 치환으로 잉크 토큰을 얻는다. */}
        <span
          className="font-display text-[30px] font-black leading-none tabular-nums"
          style={{ color: band.colorVar.replace(/\)$/, "-ink)") }}
        >
          {Math.round(display)}
          <span className="align-top text-lg">°</span>
        </span>
        <span className="mt-2 line-clamp-2 min-h-[2.2em] text-[13px] font-semibold leading-snug text-foreground">
          {label}
        </span>
        {/* 구간 라벨 — 배경 없는 텍스트 + 작은 색 도트(경량) */}
        <span className="mt-auto flex items-center gap-1.5 pt-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
          <span
            aria-hidden
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: band.colorVar }}
          />
          {band.label}
        </span>
      </Link>
    </li>
  );
}

/** 공론 기상도 밴드 (클라이언트, 15분 자동 갱신) */
export function WeatherBand({
  initialItems,
  initialComputedAt,
}: WeatherBandProps) {
  const reduced = usePrefersReducedMotion();
  const [items, setItems] = useState<TemperatureBoardItem[]>(initialItems);
  const itemsRef = useRef(items);
  itemsRef.current = items; // 렌더마다 최신 items 를 ref 로 동기화
  const [computedAt, setComputedAt] = useState<string | null>(
    initialComputedAt,
  );
  // 라이브 펄스용: 직전 온도값 스냅샷 + 칸별 펄스 카운터(표시 레이어 전용).
  const prevTempsRef = useRef<Map<string, number>>(
    new Map(initialItems.map((it) => [it.id, it.temperature])),
  );
  const [pulseKeys, setPulseKeys] = useState<Map<string, number>>(new Map());

  // 폴링(TOP5) 결과를 8칸에 제자리 반영한다: 존재하는 id 만 온도 갱신, 나머지 유지.
  const applyBoard = useCallback((board: TemperatureBoard) => {
    const incoming = new Map(board.items.map((it) => [it.id, it]));
    const prev = prevTempsRef.current;
    const changedIds: string[] = [];
    const next = itemsRef.current.map((it) => {
      const upd = incoming.get(it.id);
      if (!upd) return it;
      const before = prev.get(it.id);
      if (before != null && Math.round(before) !== Math.round(upd.temperature)) {
        changedIds.push(it.id);
      }
      return {
        ...it,
        temperature: upd.temperature,
        rank: upd.rank,
        prevRank: upd.prevRank,
        computedAt: upd.computedAt,
      };
    });
    if (changedIds.length > 0) {
      setPulseKeys((current) => {
        const updated = new Map(current);
        for (const id of changedIds) {
          updated.set(id, (current.get(id) ?? 0) + 1);
        }
        return updated;
      });
    }
    prevTempsRef.current = new Map(next.map((it) => [it.id, it.temperature]));
    setItems(next);
    setComputedAt(board.computedAt || null);
  }, []);
  useTemperatureLiveData(applyBoard);

  const updatedAt = formatDateTime(computedAt);

  return (
    <section
      aria-label="오늘의 공론 기상도"
      className="border-b border-line bg-surface"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="flex flex-col gap-3 py-3 lg:flex-row lg:items-stretch lg:gap-5">
          {/* 좌측 리드 (소형캡 + 한 줄 설명 + 갱신 시각) */}
          <div className="shrink-0 lg:w-[170px]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              오늘의 공론 기상도
            </p>
            <p className="mt-1 font-display text-sm font-semibold leading-snug text-foreground">
              이슈별 공론 온도를 한눈에
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {updatedAt ? `${updatedAt} 기준 · 15분 갱신` : "15분마다 갱신"}
            </p>
          </div>

          {/* 우측 이슈 8칸 그리드 (칸 사이 hairline) */}
          {items.length === 0 ? (
            <p className="flex-1 self-center text-sm text-muted-foreground lg:border-l lg:border-line lg:pl-5">
              아직 집계된 공론 온도가 없습니다. 댓글·기사 데이터가 쌓이면 이슈별
              온도가 표시됩니다.
            </p>
          ) : (
            <ul className="grid flex-1 grid-cols-2 gap-px overflow-hidden bg-line sm:grid-cols-4 xl:grid-cols-8 lg:border-l lg:border-line">
              {items.map((item) => (
                <WeatherCell
                  key={item.id}
                  item={item}
                  reduced={reduced}
                  pulseKey={pulseKeys.get(item.id) ?? 0}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
