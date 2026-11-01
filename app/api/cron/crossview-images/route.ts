// ============================================================================
// POST/GET /api/cron/crossview-images — 크로스뷰 카드 이미지 자동 생성 Cron
//
// 매칭으로 새로 승인된(status=approved, card_image_url is null) 크로스뷰 페어에
// Gemini 시네마틱 히어로 이미지를 생성해 붙인다. 매시 실행 가정(멱등: 이미 이미지가
// 있으면 대상에서 제외). 인증: Authorization: Bearer $CRON_SECRET.
// ============================================================================

import { NextResponse, type NextRequest } from "next/server";
import { isCronAuthorized } from "@/lib/cron/auth";
import { backfillCrossviewImages } from "@/lib/ai/image";
import { backfillCrossviewHeadlines } from "@/lib/ai/headline";
import type { ApiResponse } from "@/types";

/** CRON_SECRET 검증 — lib/cron/auth 공용(상수 시간 비교) */
function isAuthorized(request: NextRequest): boolean {
  return isCronAuthorized(request.headers);
}

type BackfillCounts = { generated: number; failed: number; targeted: number };

async function handle(
  request: NextRequest,
): Promise<NextResponse<ApiResponse<{ images: BackfillCounts; headlines: BackfillCounts }>>> {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { data: null, error: { code: "unauthorized", message: "인증 실패" } },
      { status: 401 },
    );
  }
  try {
    // 한 번에 과금·부하가 크지 않게 회당 상한을 둔다(신규 승인은 보통 소수).
    const url = new URL(request.url);
    const limit = Math.min(Number(url.searchParams.get("limit")) || 20, 50);
    // 신규 승인 페어에 시네마틱 히어로 이미지 + 짧은 대조 헤드라인을 함께 채운다.
    const images = await backfillCrossviewImages(limit);
    const headlines = await backfillCrossviewHeadlines(limit);
    return NextResponse.json({ data: { images, headlines }, error: null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "크로스뷰 카드 생성 오류";
    console.error("[cron/crossview-images] 실패:", message);
    return NextResponse.json(
      { data: null, error: { code: "crossview_card_failed", message } },
      { status: 500 },
    );
  }
}

export const GET = handle;
export const POST = handle;
