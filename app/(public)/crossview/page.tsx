// ============================================================================
// /crossview — 크로스뷰 목록 = 괘선 행 (FR-CV)
//
// 「일점 지면」: 제호 → 텍스트 탭 필터(카테고리·정렬) → 괘선 행 목록.
//   행 = 광역 제목(⋯) 위 · 기초 제목(▬) 아래 — 두 제목 같은 굵기 700, 사이 세로 괘선 없음
//   (Figma #12, 2026-09-11: 항목 옆 테두리·"보도 유사도 N%" 문구 제거).
//   제호 아래 범례: 마커 + 매체 아이콘(<MediaIcon> 송신탑/종이신문) + "방송 · MBC충북 / 지면 · 옥천신문".
//   사진 없음 — 헤드라인 활자가 목록이다. 온도는 실 산출 보드와 키워드 매칭
//   (tempForItem)된 행만 숫자+활자로 표기하고, 미매칭 행은 온도 자리를 비운다.
//   카테고리·정렬 탭은 가로 스크롤 스트립(app/crossview.css .cvp-tabs).
//
// 서버 컴포넌트: Supabase anon + RLS 로 approved 페어만 조회.
// URL 쿼리(?cat=&sort=)를 단일 상태 소스로 삼아 필터/정렬된 초기 페이지를
// 서버에서 받고, 이후 무한 스크롤은 클라이언트(CrossviewList)가 처리한다.
// 스키마 미적용/조회 실패 시에도 안전하게(빈 목록/에러 폴백) 렌더한다.
// ============================================================================

import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import {
  listApprovedPairs,
  type CrossviewListResult,
  type CrossviewPairWithArticles,
} from "@/lib/matching";
// CrossviewSort 는 배럴(index.ts) 미노출 → 정의 모듈에서 직접 가져온다.
import type { CrossviewSort } from "@/lib/matching/queries";
import { getTemperatureBoard } from "@/lib/temperature/board";
import type { TemperatureBoardItem } from "@/types";
import { CrossviewFilter, CrossviewList, Marker } from "@/components/crossview";
import { MediaIcon } from "@/components/ui/media-icon";
import "@/app/crossview.css";
import { region } from "@/config/region";

export const metadata: Metadata = {
  title: "크로스뷰", // layout template 이 " · ZONE-2" 를 붙인다
  description:
    `${region.site.name} 크로스뷰가 ${region.outlets.macro.name}과 ${region.outlets.micro.name} 보도를 엮어 같은 사안을 설명합니다.`,
};

export const dynamic = "force-dynamic";

/** 페이지당 항목 수 (FR-CV-01) */
const PAGE_SIZE = 10;

/** 기본 카테고리 탭 (항상 노출). 데이터에 있는 기타 카테고리는 추가로 병합한다. */

/** 초기 approved 페어 조회 — 실패는 error 플래그로 (빈 목록 폴백) */
async function fetchInitial(
  category: string | undefined,
  sort: CrossviewSort,
): Promise<{ result: CrossviewListResult; error: boolean }> {
  try {
    const supabase = await createClient();
    const result = await listApprovedPairs(supabase, {
      limit: PAGE_SIZE,
      category,
      sort,
    });
    return { result, error: false };
  } catch (e) {
    console.error("[/crossview] 목록 조회 실패:", e);
    return { result: { items: [], nextCursor: null }, error: true };
  }
}

/** 공론 온도 보드(상위 8건, 홈과 동일 소스). 실패 시 빈 배열 → 전 행 점선 */
async function fetchTemperature(): Promise<TemperatureBoardItem[]> {
  try {
    const board = await getTemperatureBoard(8);
    return board.items;
  } catch (e) {
    console.error("[/crossview] 온도 보드 조회 실패:", e);
    return [];
  }
}

/** 탭 목록 = 기본 5개 + 현재 페이지에서 발견된 기타 + 활성 카테고리(항상 포함) */
function deriveCategories(
  items: CrossviewPairWithArticles[],
  active: string | null,
): string[] {
  const discovered = items
    .map((p) => p.macro?.category ?? p.micro?.category)
    .filter((c): c is string => Boolean(c));
  // 고정 카테고리 목록은 쓰지 않는다 — 기사에 카테고리가 없으면 탭이 전부 0건이 된다(2026-09-07).
  // 실제 데이터에 있는 카테고리만 노출하고, 선택된 값은 유지한다.
  const merged = [...discovered];
  if (active) merged.push(active);
  return Array.from(new Set(merged));
}

export default async function CrossviewPage({
  searchParams,
}: {
  searchParams: Promise<{ cat?: string; sort?: string }>;
}) {
  const sp = await searchParams;
  const activeCategory = sp.cat && sp.cat !== "all" ? sp.cat : null;
  const activeSort: CrossviewSort = sp.sort === "score" ? "score" : "latest";

  const [{ result, error }, temperature] = await Promise.all([
    fetchInitial(activeCategory ?? undefined, activeSort),
    fetchTemperature(),
  ]);
  const categories = deriveCategories(result.items, activeCategory);

  return (
    <main className="cvp cvp-list">
      {/* 제호 — 표지 제호와 같은 활자. 마커 어휘를 매체 아이콘·라벨과 함께 병기(색 의존 0) */}
      <header className="cvp-mast">
        <h1>크로스뷰</h1>
        <p>
          <Marker side="macro" /> <MediaIcon kind="broadcast" className="cvp-mi" />방송 · {region.outlets.macro.name} &nbsp;{" "}
          <Marker side="micro" /> <MediaIcon kind="paper" className="cvp-mi" />지면 · {region.outlets.micro.name}{" "}
          {/* 꼬리는 한 덩어리(nowrap) — 폰에서 "두 / 시선" 으로 갈라지지 않게(app/crossview.css) */}
          <span className="cvp-mast-tag">&nbsp;— 같은 사안, 두 시선</span>
        </p>
      </header>

      <CrossviewFilter
        categories={categories}
        activeCategory={activeCategory}
        activeSort={activeSort}
      />

      {/* category/sort 가 바뀌면 key 로 리마운트 → 훅이 초기값에서 새로 시작 */}
      <CrossviewList
        key={`${activeCategory ?? "all"}:${activeSort}`}
        initialItems={result.items}
        initialCursor={result.nextCursor}
        initialError={error}
        category={activeCategory}
        sort={activeSort}
        temperature={temperature}
      />
    </main>
  );
}
