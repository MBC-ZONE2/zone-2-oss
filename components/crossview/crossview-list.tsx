// ============================================================================
// components/crossview/crossview-list — 무한 스크롤 목록 (FR-CV-01·07)
//
// useCrossviewList 훅으로 상태를 관리하고(로직 무변경), 괘선 행 목록 + 하단 감시
// sentinel + 점선 로딩 행 + 에러 재시도(최대 3회)/지원 문의 + 빈 상태를 렌더한다.
// category/sort 가 바뀌면 부모가 key 로 리마운트하므로 초기값에서 새로 시작한다.
// 온도 보드(temperature)는 서버가 한 번 넘기고 행마다 tempForItem 으로 매칭한다.
// ============================================================================

"use client";

import Link from "next/link";
import type { CrossviewPairWithArticles } from "@/lib/matching";
// CrossviewSort 는 배럴 미노출 → 정의 모듈에서 직접 가져온다.
import type { CrossviewSort } from "@/lib/matching/queries";
import type { TemperatureBoardItem } from "@/types";
import { CrossviewCard } from "./crossview-card";
import { CrossviewCardSkeleton } from "./crossview-skeleton";
import { useCrossviewList } from "./use-crossview-list";

export interface CrossviewListProps {
  initialItems: CrossviewPairWithArticles[];
  initialCursor: string | null;
  initialError: boolean;
  category: string | null;
  sort: CrossviewSort;
  /** 공론 온도 보드(실 산출, 서버 조회). 실패 시 빈 배열 → 전 행 점선 */
  temperature?: TemperatureBoardItem[];
}

/** 목록 클라이언트 — 무한 스크롤 + 상태 처리 */
export function CrossviewList({
  initialItems,
  initialCursor,
  initialError,
  category,
  sort,
  temperature = [],
}: CrossviewListProps) {
  const { items, loading, error, hasMore, canRetry, retry, sentinelRef } =
    useCrossviewList({ initialItems, initialCursor, initialError, category, sort });

  // 빈 상태: 로딩·에러가 아니고 항목이 없을 때 (FR-CV-02 카테고리 필터 대응 문구)
  if (items.length === 0 && !loading && !error) {
    return (
      <div className="cvp-empty">
        <strong>
          {category ? `'${category}' 크로스뷰가 아직 없습니다` : "표시할 크로스뷰가 없습니다"}
        </strong>
        <p>
          {category
            ? "다른 갈래를 고르거나 잠시 후 다시 확인해 주세요."
            : "수집·매칭이 완료되면 이곳에 찍힙니다."}
        </p>
      </div>
    );
  }

  return (
    <div>
      <ol className="cvp-rows">
        {items.map((pair) => (
          <CrossviewCard key={pair.id} pair={pair} temperature={temperature} />
        ))}
        {loading
          ? Array.from({ length: 3 }).map((_, i) => <CrossviewCardSkeleton key={`sk-${i}`} />)
          : null}
      </ol>

      {/* 에러 상태: 재시도 3회 이내면 버튼, 초과 시 지원 문의 (FR-CV-07) */}
      {error ? (
        <div role="alert" className="cvp-empty">
          <strong>목록을 불러오지 못했습니다</strong>
          {canRetry ? (
            <button type="button" onClick={retry} className="cvp-textbtn">
              다시 불러오기
            </button>
          ) : (
            <p>
              문제가 계속되면 잠시 후 다시 방문하거나{" "}
              <Link href="/forum">공론장에 알려 주세요</Link>.
            </p>
          )}
        </div>
      ) : null}

      {/* 무한 스크롤 감시 지점 — 하단 200px 진입 시 loadMore (훅 내부) */}
      <div ref={sentinelRef} aria-hidden className="h-px w-full" />

      {/* 스크린리더용 로드 상태 안내 */}
      <span className="sr-only" role="status" aria-live="polite">
        {loading ? "목록을 불러오는 중입니다." : hasMore ? "" : "마지막 항목입니다."}
      </span>
    </div>
  );
}
