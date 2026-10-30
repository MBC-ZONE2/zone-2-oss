// ============================================================================
// GET /api/temperature — 현재 TOP5 + 최신 온도 보드
//
// docs/06 §3: 응답 TemperatureBoard. 공개 GET(anon + RLS).
// ?limit= (선택, 1~20 클램프, 기본 TOP5). 온도계 화면의 라이브 갱신은 12기둥을
// 통째로 교체해야 하므로 ?limit=12 로 부른다(useBoardLive).
// ============================================================================

import { getTemperatureBoard, TOP_N } from "@/lib/temperature/board";
import { fail, ok } from "@/lib/temperature/http";

// 항상 최신 산출을 보여줘야 하므로 캐시하지 않는다.
export const dynamic = "force-dynamic";

/** ?limit= 상한 — 보드 화면(12)보다 조금 넉넉하게, 그 이상은 잘라낸다. */
const API_MAX_LIMIT = 20;

/** ?limit= 파싱 — 숫자가 아니면 기본 TOP5, 1~20 으로 클램프 */
function parseLimit(request: Request): number {
  const raw = new URL(request.url).searchParams.get("limit");
  const n = raw ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return TOP_N;
  return Math.min(API_MAX_LIMIT, Math.max(1, Math.floor(n)));
}

export async function GET(request: Request) {
  try {
    const board = await getTemperatureBoard(parseLimit(request));
    return ok(board);
  } catch (error) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    console.error("GET /api/temperature 실패:", message);
    return fail(500, "temperature_board_failed", "온도 보드를 불러오지 못했습니다.");
  }
}
