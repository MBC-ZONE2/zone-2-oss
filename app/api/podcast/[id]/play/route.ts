// ============================================================================
// POST /api/podcast/[id]/play — 재생 시작 카운트 (#117)
//
// KPI "AI 팟캐스트 월 500회+ 재생" 측정용. 클라이언트(오디오 플레이어)가 사용자가
// **실제로 재생을 시작**할 때, 에피소드당 세션 1회만 호출한다(자동재생·프리로드
// 부풀림 방지는 클라이언트 책임). 서버는 원자적 +1 만 한다.
//   - 공개(published) 에피소드에만 카운트한다(RPC 내부에서 가드).
//   - 인증 불필요(익명 청취도 KPI 대상). 남용 여지는 단순 +1 로 제한된다.
// ============================================================================

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json(
      { data: null, error: { message: "잘못된 에피소드 id" } },
      { status: 400 },
    );
  }

  const supabase = createServiceClient();
  const { error } = await supabase.rpc("increment_podcast_play", { ep: id });
  if (error) {
    // 카운트 실패가 재생을 막지 않도록 흡수(로그만). 클라이언트는 무시한다.
    console.error("[podcast/play] 카운트 실패:", error.message);
    return new NextResponse(null, { status: 204 });
  }
  return new NextResponse(null, { status: 204 });
}
