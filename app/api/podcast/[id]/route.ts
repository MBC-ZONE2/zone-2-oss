// ============================================================================
// GET /api/podcast/[id] — 발행된 에피소드 상세 (오디오 url + 스크립트)
//
// 응답 규약(docs/06 §2): { data, error }
// Next.js 15: route handler 의 params 는 Promise 이므로 await 한다.
// ============================================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPublishedEpisode } from "@/lib/podcast";
import type { ApiResponse, Episode } from "@/types";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse<ApiResponse<Episode>>> {
  try {
    const { id } = await context.params;

    const supabase = await createClient();
    const episode = await getPublishedEpisode(supabase, id);

    if (!episode) {
      return NextResponse.json(
        {
          data: null,
          error: { code: "episode_not_found", message: "에피소드를 찾을 수 없습니다." },
        },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: episode, error: null });
  } catch (error) {
    console.error("[GET /api/podcast/[id]] 실패:", error);
    return NextResponse.json(
      {
        data: null,
        error: { code: "episode_detail_failed", message: "에피소드를 불러오지 못했습니다." },
      },
      { status: 500 },
    );
  }
}
