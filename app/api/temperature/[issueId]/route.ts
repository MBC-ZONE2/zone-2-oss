// ============================================================================
// GET /api/temperature/[issueId] — 이슈 온도 추이 + 감정 분포
//
// docs/06 §3 + F4 확장: 응답 { trend: TemperaturePoint[], sentimentDist }.
//   (기존 추이 데이터 유지 + sentimentDist{pos,neu,neg} 추가) 공개 GET(anon + RLS).
// Next 15: 동적 라우트의 params 는 Promise 이므로 await 한다.
// ?limit= 으로 최근 포인트 수 조절 (board.getIssueTrend 가 상한 클램프).
// ?fields=trend 축약 모드: 감정 분포(7일 댓글 최대 5,000건 스캔)를 건너뛰고 { trend } 만
// 돌려준다 — 온도판 7일 잔상(TemperatureColumns) 전용. 파라미터 없으면 기존 형태 그대로.
// 온도 배치는 15분 간격이므로 Cache-Control: private, max-age=300 으로 재요청을 줄인다.
// ============================================================================

import {
  getIssueSentimentDist,
  getIssueTrend,
  type IssueTrendResponse,
} from "@/lib/temperature/board";
import { fail, ok } from "@/lib/temperature/http";

export const dynamic = "force-dynamic";

/** 성공 응답 캐시 — 배치 15분 간격의 1/3(브라우저 개인 캐시만) */
const CACHE_INIT: ResponseInit = {
  headers: { "Cache-Control": "private, max-age=300" },
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ issueId: string }> },
) {
  const { issueId } = await params;

  if (!issueId) {
    return fail(400, "missing_issue_id", "issueId 가 필요합니다.");
  }

  // ?limit= (선택). 숫자가 아니면 기본값 사용.
  const searchParams = new URL(request.url).searchParams;
  const limitParam = searchParams.get("limit");
  const limit = limitParam ? Number(limitParam) : undefined;
  // ?fields=trend → 감정 분포 생략(잔상용 축약 모드)
  const trendOnly = searchParams.get("fields") === "trend";

  try {
    const safeLimit = Number.isFinite(limit) ? (limit as number) : undefined;
    if (trendOnly) {
      const body: Pick<IssueTrendResponse, "trend"> = {
        trend: await getIssueTrend(issueId, safeLimit),
      };
      return ok(body, CACHE_INIT);
    }
    const [trend, sentimentDist] = await Promise.all([
      getIssueTrend(issueId, safeLimit),
      getIssueSentimentDist(issueId),
    ]);
    const body: IssueTrendResponse = { trend, sentimentDist };
    return ok(body, CACHE_INIT);
  } catch (error) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    console.error(`GET /api/temperature/${issueId} 실패:`, message);
    return fail(500, "temperature_trend_failed", "온도 추이를 불러오지 못했습니다.");
  }
}
