// ============================================================================
// POST/GET /api/cron/match — 크로스뷰 매칭 Cron Worker
//
// docs/06 §5: ingest 후 실행. pgvector 후보 → Claude 재랭킹 → 요약
//             → crossview_pairs(candidate) 저장.
// 인증: 헤더 Authorization: Bearer $CRON_SECRET (docs/06 §2).
//
// service_role 클라이언트로 실행한다(RLS 우회, 쓰기 필요).
// ⚠️ AI 함수가 스텁이라 실제 실행 시 throw 될 수 있다(키 연결 후 동작).
//    인증/오케스트레이션 계약만 고정한다.
// ============================================================================

import { NextResponse, type NextRequest } from "next/server";
import { isCronAuthorized } from "@/lib/cron/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { runMatching } from "@/lib/matching";

// 매칭은 구독 CLI(codex, child_process)를 쓰므로 Node 런타임 필수(edge 불가).
// self-host(Mac Mini)는 Node 로 구동하므로 nodejs 로 둔다.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** CRON_SECRET 검증 — lib/cron/auth 공용(상수 시간 비교) */
function isAuthorized(request: NextRequest): boolean {
  return isCronAuthorized(request.headers);
}

/** 매칭 실행 핸들러 (GET/POST 공용) */
async function handle(request: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { data: null, error: { code: "unauthorized", message: "유효한 CRON_SECRET 이 필요합니다." } },
      { status: 401 },
    );
  }

  try {
    const supabase = createServiceClient();
    const summary = await runMatching(supabase);
    return NextResponse.json({ data: summary, error: null });
  } catch (error) {
    console.error("크로스뷰 매칭 실패:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          code: "match_failed",
          message: "크로스뷰 매칭 실행 중 오류가 발생했습니다.",
        },
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  return handle(request);
}

// Cloudflare Cron Triggers 는 GET 으로 호출될 수 있어 둘 다 지원한다.
export async function GET(request: NextRequest) {
  return handle(request);
}
