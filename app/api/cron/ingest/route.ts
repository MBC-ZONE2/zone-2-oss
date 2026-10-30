// ============================================================================
// /api/cron/ingest — 수집 Cron Worker (+ 매칭 체이닝)
//
// docs/06 §5: 매시 실행. 어댑터 수집 → 정규화 → 임베딩 → 적재. 멱등.
//             매칭(/cron/match 로직)은 별도 스케줄 없이 수집 직후 여기서
//             체이닝 실행한다 (launchd 크론 deploy/launchd/kr.zone2.ingest.plist 가 매시 호출).
//             매칭 실패는 수집 결과를 깨지 않고 matchError 로 보고한다.
// docs/06 §2: Cron 인증 = 헤더 Authorization: Bearer $CRON_SECRET.
//             응답 포맷 = { data, error } (성공 시 error: null).
// ============================================================================

import { NextResponse } from "next/server";
import { runIngest, type IngestResult } from "@/lib/ingest";
import { pruneYoutubeCommentBodies } from "@/lib/ingest/retention";
import { createServiceClient } from "@/lib/supabase/server";
import { runMatching, type MatchRunSummary } from "@/lib/matching";
import type { ApiResponse } from "@/types";

// Node 런타임 강제: lib/ingest/hash 가 node:crypto 를 사용한다.
export const runtime = "nodejs";
// 항상 동적 실행 (캐시 금지) — 매시 수집 작업.
export const dynamic = "force-dynamic";

/** Bearer 토큰이 CRON_SECRET 과 일치하는지 검증한다 */
function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  // 시크릿 미설정이면 인증 불가(안전 실패).
  if (!secret) return false;

  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;

  // 길이가 다르면 즉시 불일치 (timingSafeEqual 은 동일 길이 요구).
  if (header.length !== expected.length) return false;

  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  // 상수 시간 비교로 타이밍 공격 완화.
  return timingSafeEqualLoose(a, b);
}

/** 길이가 같은 두 버퍼의 상수 시간 비교 (node:crypto 동적 import 회피) */
function timingSafeEqualLoose(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

function unauthorized(): NextResponse<ApiResponse<never>> {
  return NextResponse.json<ApiResponse<never>>(
    { data: null, error: { code: "UNAUTHORIZED", message: "유효한 CRON_SECRET 이 필요합니다." } },
    { status: 401 },
  );
}

/** 수집 + 매칭 체이닝 결과 */
interface IngestCronResult {
  ingest: IngestResult;
  /** 수집 직후 실행한 매칭 요약 (실패 시 null) */
  match: MatchRunSummary | null;
  /** 매칭 단계 실패 메시지 (수집 자체는 성공) */
  matchError: string | null;
}

/** 수집 실행 공통 핸들러 (GET/POST 공유) */
async function handle(request: Request): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    return unauthorized();
  }

  try {
    const result = await runIngest();
    // 보존 기간 — 30일 지난 유튜브 댓글 본문 비우기(YouTube API 약관·최소 보유, lib/ingest/retention)
    await pruneYoutubeCommentBodies(createServiceClient());

    // 수집 직후 매칭 체이닝 — 새 기사가 없어도 멱등(lookback 내 재계산).
    // 매칭 실패가 수집 성공 응답을 500 으로 바꾸면 안 되므로 격리한다.
    let match: MatchRunSummary | null = null;
    let matchError: string | null = null;
    try {
      match = await runMatching(createServiceClient());
    } catch (error) {
      matchError = error instanceof Error ? error.message : String(error);
      console.error("[cron/ingest] 수집 후 매칭 체이닝 실패:", error);
    }

    const body: ApiResponse<IngestCronResult> = {
      data: { ingest: result, match, matchError },
      error: null,
    };
    // 어댑터 일부 치명 에러가 있어도 멱등 재실행으로 회복 가능 → 200 유지,
    // 상세는 ingest.adapters[].error / matchError 로 전달.
    return NextResponse.json(body, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const body: ApiResponse<never> = {
      data: null,
      error: { code: "INGEST_FAILED", message },
    };
    return NextResponse.json(body, { status: 500 });
  }
}

// Cloudflare Cron 트리거는 GET 으로 호출되므로 GET/POST 모두 지원.
export async function GET(request: Request): Promise<NextResponse> {
  return handle(request);
}

export async function POST(request: Request): Promise<NextResponse> {
  return handle(request);
}
