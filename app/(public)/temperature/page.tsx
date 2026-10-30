// ============================================================================
// /temperature — 공론 온도계 페이지 (서버 컴포넌트, 검은 세계)
//
// 서버에서 초기 보드(12사안: TOP5 다섯 줄 + 12기둥)를 받아 클라이언트 뷰(Realtime 구독)
// 로 전달한다. 산출 데이터가 없거나 조회 실패해도 빈 보드로 안전하게 렌더한다.
// 온도가 전부 0 이면(기획안 (6)) "마지막으로 뜨거웠던 사안" 1건을 추가로 읽어
// 문구에 넣는다 — 실패하면 문구만("오늘은 잠잠합니다").
// ============================================================================

import { getIssueById, getTemperatureBoard } from "@/lib/temperature/board";
import { createClient } from "@/lib/supabase/server";
import type { TemperatureBoard } from "@/types";
import {
  TemperatureBoardView,
  type LastHot,
} from "@/components/temperature/TemperatureBoardView";
import { region } from "@/config/region";

// 항상 최신 산출을 반영
export const dynamic = "force-dynamic";

export const metadata = {
  title: "공론 온도계", // layout template 이 " · ZONE-2" 를 붙인다
  description:
    `${region.place.province} 지역 댓글·공론장 여론을 분석해 이슈별 온도(0~100)와 TOP5 핫이슈를 15분마다 보여줍니다.`,
};

/** 12기둥 — 보드 상한(getTemperatureBoard limit) */
const COLUMN_N = 12;

const EMPTY_BOARD: TemperatureBoard = {
  items: [],
  computedAt: new Date(0).toISOString(),
};

/** 온도가 0 보다 컸던 가장 최근 점수 1건(anon + RLS). 없거나 실패하면 null. */
async function getLastHot(): Promise<LastHot | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("temperature_scores")
      .select("temperature, computed_at, issue_id")
      .gt("temperature", 0)
      .order("computed_at", { ascending: false })
      .order("temperature", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    const row = data as { temperature: number; computed_at: string; issue_id: string | null };
    const issue = row.issue_id ? await getIssueById(row.issue_id).catch(() => null) : null;
    return {
      label: issue?.label ?? "이름 없는 사안",
      date: row.computed_at,
      max: row.temperature,
    };
  } catch {
    return null;
  }
}

export default async function TemperaturePage() {
  let board: TemperatureBoard = EMPTY_BOARD;
  try {
    board = await getTemperatureBoard(COLUMN_N);
  } catch (error) {
    // 조회 실패 시에도 페이지는 떠야 한다 (빈 보드 + 클라이언트가 재시도).
    console.error("온도계 페이지 초기 로드 실패:", error);
  }

  // 온도 전부 0 → 순위 눈금 모드 문구용 "마지막으로 뜨거웠던 사안"
  const allZero =
    board.items.length > 0 && board.items.every((it) => !(Number(it.temperature) > 0));
  const lastHot = allZero ? await getLastHot() : null;

  return <TemperatureBoardView initialBoard={board} lastHot={lastHot} />;
}
