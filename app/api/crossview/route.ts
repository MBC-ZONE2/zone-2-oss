// ============================================================================
// GET /api/crossview — 크로스뷰 페어 목록 (approved, cursor 페이지네이션)
//
// docs/06 §3. 응답: { data: { items, nextCursor }, error }
// 인증: Supabase anon (RLS로 approved만 노출). 쿼리에서도 status='approved' 명시.
// ============================================================================

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listApprovedPairs } from "@/lib/matching";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    // created_at 커서의 "+00:00" 이 인코딩 없이 오면 공백이 된다(운영 로그 "invalid input syntax for type timestamptz") — 되돌린다
    const cursor = searchParams.get("cursor")?.replace(/ /g, "+") ?? undefined;
    const limitRaw = searchParams.get("limit");
    const limit = limitRaw ? Number(limitRaw) : undefined;

    // 카테고리 필터(cat)·정렬(sort) — 미지정/기본값이면 기존 동작과 동일하게 통과.
    const catRaw = searchParams.get("cat");
    const category = catRaw && catRaw !== "all" ? catRaw : undefined;
    const sort = searchParams.get("sort") === "score" ? "score" : undefined;

    const supabase = await createClient();
    const result = await listApprovedPairs(supabase, {
      cursor,
      limit,
      category,
      sort,
    });

    return NextResponse.json({ data: result, error: null });
  } catch (error) {
    console.error("크로스뷰 목록 조회 실패:", error);
    return NextResponse.json(
      {
        data: null,
        error: { code: "list_failed", message: "크로스뷰 목록을 불러오지 못했습니다." },
      },
      { status: 500 },
    );
  }
}
