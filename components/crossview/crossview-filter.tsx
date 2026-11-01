// ============================================================================
// components/crossview/crossview-filter — 카테고리·정렬 텍스트 탭 (FR-CV-02·03·06)
//
// URL 쿼리(?cat=&sort=)를 단일 소스로 두고 router.push 로 갱신한다(로직 무변경).
// 서버가 새 searchParams 로 재렌더 → 목록이 새 데이터로 리셋되고, 뒤로가기 시
// 이전 URL 로 복원된다. router.push 는 기본적으로 상단으로 스크롤한다(상단 복귀).
//
// 「일점 지면」: 칩·드롭다운 대신 텍스트 탭(44px). 활성 = 잉크 700 + 아래 2px 괘선.
// 정렬도 <select> 가 아니라 같은 문법의 텍스트 탭이다.
// '온도높은순'은 페어-온도 데이터 연결이 없어 정렬 옵션에서 제외한다.
// 스타일: app/crossview.css(.cvp-filter)
// ============================================================================

"use client";

import { useRouter } from "next/navigation";
import type { CrossviewSort } from "@/lib/matching/queries";

/** 전체(필터 없음) 센티널 */
const ALL = "all";

const SORT_OPTIONS: { value: CrossviewSort; label: string }[] = [
  { value: "latest", label: "최신순" },
  { value: "score", label: "매칭신뢰도순" },
];

/** cat/sort 로 크로스뷰 목록 URL 을 만든다(기본값은 파라미터 생략). */
function buildHref(category: string, sort: CrossviewSort): string {
  const params = new URLSearchParams();
  if (category && category !== ALL) params.set("cat", category);
  if (sort === "score") params.set("sort", sort);
  const qs = params.toString();
  return qs ? `/crossview?${qs}` : "/crossview";
}

export interface CrossviewFilterProps {
  /** 표시할 카테고리 목록(전체 제외) */
  categories: string[];
  /** 현재 선택된 카테고리(null=전체) */
  activeCategory: string | null;
  /** 현재 정렬 */
  activeSort: CrossviewSort;
}

/** 카테고리 텍스트 탭 + 정렬 텍스트 탭 */
export function CrossviewFilter({
  categories,
  activeCategory,
  activeSort,
}: CrossviewFilterProps) {
  const router = useRouter();
  const current = activeCategory ?? ALL;

  const goCategory = (category: string) => {
    if (category === current) return;
    router.push(buildHref(category, activeSort));
  };

  const goSort = (sort: CrossviewSort) => {
    if (sort === activeSort) return;
    router.push(buildHref(current, sort));
  };

  const chips = [{ value: ALL, label: "전체" }, ...categories.map((c) => ({ value: c, label: c }))];

  return (
    <div className="cvp-filter">
      {/* 카테고리가 하나도 없으면(기사 category 미분류) 필터 줄 자체를 숨긴다 — '전체'만 남는 탭은 의미가 없다 */}
      {categories.length > 0 ? (
      <div className="cvp-filter-group" role="group" aria-label="카테고리 필터">
        <ul className="cvp-tabs">
          {chips.map((chip) => {
            const active = chip.value === current;
            return (
              <li key={chip.value}>
                <button
                  type="button"
                  className="cvp-tab"
                  aria-pressed={active}
                  onClick={() => goCategory(chip.value)}
                >
                  {chip.label}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      ) : null}

      <div className="cvp-filter-group" role="group" aria-label="목록 정렬">
        <span className="cvp-filter-k" aria-hidden="true">
          정렬
        </span>
        <ul className="cvp-tabs">
          {SORT_OPTIONS.map((opt) => {
            const active = opt.value === activeSort;
            return (
              <li key={opt.value}>
                <button
                  type="button"
                  className="cvp-tab"
                  aria-pressed={active}
                  onClick={() => goSort(opt.value)}
                >
                  {opt.label}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
