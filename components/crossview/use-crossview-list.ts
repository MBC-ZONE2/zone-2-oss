"use client";

// ============================================================================
// components/crossview/use-crossview-list — 무한 스크롤 목록 상태 훅 (FR-CV-01·07)
//
// 서버가 넘긴 초기 페이지에서 시작해 IntersectionObserver 로 하단 200px 진입 시
// 다음 페이지를 cursor 기반으로 이어붙인다. 에러 시 자동 로드를 멈추고 수동
// "다시 불러오기"만 허용하며 최대 3회로 제한한다(초과 시 지원 문의 노출).
//
// category/sort 는 부모(page)가 URL 로 관리하고, 값이 바뀌면 목록 컴포넌트를
// 리마운트(key)하므로 이 훅은 초기값에서 새로 시작한다.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import type { ApiResponse } from "@/types";
import type {
  CrossviewListResult,
  CrossviewPairWithArticles,
  CrossviewSort,
} from "@/lib/matching/queries";

/** 에러 최대 재시도 횟수 (FR-CV-07) */
export const MAX_RETRIES = 3;

/** 페이지 크기 (FR-CV-01: 페이지당 10개) */
const PAGE_SIZE = 10;

export interface UseCrossviewListParams {
  initialItems: CrossviewPairWithArticles[];
  initialCursor: string | null;
  /** 서버 초기 조회 실패 여부 */
  initialError: boolean;
  category: string | null;
  sort: CrossviewSort;
}

/** /api/crossview 페이지 URL 구성 (기본값은 파라미터 생략) */
function buildApiUrl(
  category: string | null,
  sort: CrossviewSort,
  cursor: string | undefined,
): string {
  const p = new URLSearchParams();
  p.set("limit", String(PAGE_SIZE));
  if (category) p.set("cat", category);
  if (sort === "score") p.set("sort", sort);
  if (cursor) p.set("cursor", cursor);
  return `/api/crossview?${p.toString()}`;
}

export function useCrossviewList({
  initialItems,
  initialCursor,
  initialError,
  category,
  sort,
}: UseCrossviewListParams) {
  const [items, setItems] = useState(initialItems);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(initialError);
  const [retries, setRetries] = useState(0);

  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const fetchPage = useCallback(
    async (cur: string | undefined, mode: "replace" | "append") => {
      setLoading(true);
      setError(false);
      try {
        const res = await fetch(buildApiUrl(category, sort, cur));
        const json = (await res.json()) as ApiResponse<CrossviewListResult>;
        if (json.error || !json.data) {
          throw new Error(json.error?.message ?? "불러오기 실패");
        }
        const next = json.data;
        // append 시 id 기준 중복 제거 — score 정렬은 offset 커서라
        // 목록 변동(신규 승인·점수 갱신) 시 페이지 간 중복이 올 수 있다.
        setItems((prev) =>
          mode === "replace"
            ? next.items
            : [
                ...prev,
                ...next.items.filter(
                  (item) => !prev.some((p) => p.id === item.id),
                ),
              ],
        );
        setCursor(next.nextCursor);
        setRetries(0);
      } catch (e) {
        console.error("크로스뷰 목록 로드 실패:", e);
        setError(true);
        setRetries((r) => r + 1);
      } finally {
        setLoading(false);
      }
    },
    [category, sort],
  );

  const loadMore = useCallback(() => {
    if (loading || error || cursor == null) return;
    void fetchPage(cursor, "append");
  }, [loading, error, cursor, fetchPage]);

  const retry = useCallback(() => {
    if (loading || retries >= MAX_RETRIES) return;
    // 초기 실패(아무것도 못 불러옴)면 1페이지 재조회, 아니면 다음 페이지 재시도.
    if (items.length === 0) void fetchPage(undefined, "replace");
    else if (cursor != null) void fetchPage(cursor, "append");
  }, [loading, retries, items.length, cursor, fetchPage]);

  // 관찰자는 한 번만 붙이고, 최신 loadMore 는 ref 로 참조한다.
  const loadMoreRef = useRef(loadMore);
  loadMoreRef.current = loadMore;

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMoreRef.current();
      },
      { rootMargin: "0px 0px 200px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return {
    items,
    loading,
    error,
    hasMore: cursor != null,
    canRetry: retries < MAX_RETRIES,
    retry,
    sentinelRef,
  };
}
