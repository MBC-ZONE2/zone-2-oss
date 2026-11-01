// ============================================================================
// GET /api/crossview/[id] — 크로스뷰 페어 상세 (approved)
//
// docs/06 §3. 응답: { data: CrossviewPairWithArticles, error }
// Next15: route handler 의 params 는 Promise 이므로 await 한다.
// ============================================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getApprovedPair } from "@/lib/matching";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const supabase = await createClient();
    const pair = await getApprovedPair(supabase, id);

    if (!pair) {
      return NextResponse.json(
        {
          data: null,
          error: { code: "not_found", message: "크로스뷰 페어를 찾을 수 없습니다." },
        },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: pair, error: null });
  } catch (error) {
    console.error("크로스뷰 상세 조회 실패:", error);
    return NextResponse.json(
      {
        data: null,
        error: { code: "detail_failed", message: "크로스뷰 페어를 불러오지 못했습니다." },
      },
      { status: 500 },
    );
  }
}
