// ============================================================================
// /api/admin/banned-words — 금칙어 사전 관리 (GET / POST / DELETE)
//
// 출처: docs/06-API명세.md §4 (GET/POST/DELETE), docs/04-데이터모델.md
//
// 운영 사전(DB)을 관리한다. 시드 사전은 lib/moderation/banned-words.ts(그룹 D)에
// 정적으로 존재하며, 게시글 모더레이션 시 moderateText(text, extraDict) 의
// extraDict 로 이 DB 사전을 주입해 합쳐 검사한다.
//
// 테이블: banned_words(id uuid pk, word text unique, reason text, created_at)
//   reason 라벨은 lib/moderation 의 BannedWordReason('hate'|'spam') 과 호환.
//   ⚠️ 이 테이블 마이그레이션은 스키마 담당(Phase 0/그룹 D)이 추가한다.
//      (담당 경로 밖이라 여기선 생성하지 않음. 최종 보고에 SQL 명시.)
//
// 권한: bannedWords.manage (super_admin / operator_mbc / operator_oki)
// ============================================================================

import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { requirePermission, okResponse, errorResponse } from "@/lib/auth";
// 라벨 호환을 위해 그룹 D 의 reason 타입을 재사용한다(읽기 전용 import).
import type { BannedWordReason } from "@/lib/moderation";

export const runtime = "nodejs";

const TABLE = "banned_words";

/** DB 행 → API 표현 */
interface BannedWordRow {
  id: string;
  word: string;
  reason: BannedWordReason;
  createdAt: string;
}

/** POST 바디: 금칙어 추가 */
const createSchema = z.object({
  word: z
    .string()
    .trim()
    .min(1, { message: "word 는 비어 있을 수 없습니다." })
    .max(100),
  reason: z.enum(["hate", "spam"]),
});

/** DELETE 쿼리: id 로 삭제 */
const deleteSchema = z.object({
  id: z.string().uuid({ message: "id 는 UUID 여야 합니다." }),
});

/** DB row(snake_case) → BannedWordRow(camelCase) */
function toRow(r: Record<string, unknown>): BannedWordRow {
  return {
    id: String(r.id),
    word: String(r.word),
    reason: r.reason as BannedWordReason,
    createdAt: String(r.created_at),
  };
}

// ---------------------------------------------------------------------------
// GET — 금칙어 사전 전체 목록 (최신순)
// ---------------------------------------------------------------------------
export async function GET() {
  const guard = await requirePermission("bannedWords.manage");
  if (guard.response) return guard.response;

  const supabase = createServiceClient();
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select("id, word, reason, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("banned-words GET 실패:", error);
      return errorResponse(500, "QUERY_FAILED", "금칙어 조회에 실패했습니다.");
    }

    const items = (data ?? []).map(toRow);
    return okResponse({ items });
  } catch (error) {
    console.error("banned-words GET 오류:", error);
    return errorResponse(500, "INTERNAL_ERROR", "처리 중 오류가 발생했습니다.");
  }
}

// ---------------------------------------------------------------------------
// POST — 금칙어 추가 (중복 word 는 409)
// ---------------------------------------------------------------------------
export async function POST(request: Request) {
  const guard = await requirePermission("bannedWords.manage");
  if (guard.response) return guard.response;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return errorResponse(400, "INVALID_JSON", "요청 본문이 JSON 이 아닙니다.");
  }

  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return errorResponse(
      400,
      "VALIDATION_ERROR",
      first?.message ?? "요청 형식이 올바르지 않습니다.",
    );
  }
  // 비교 일관성을 위해 소문자로 저장(매칭 측 normalizeForMatch 도 소문자화).
  const word = parsed.data.word.toLowerCase();
  const { reason } = parsed.data;

  const supabase = createServiceClient();
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .insert({ word, reason })
      .select("id, word, reason, created_at")
      .single();

    if (error) {
      // unique 위반(중복 단어) → 409
      if (error.code === "23505") {
        return errorResponse(409, "DUPLICATE", "이미 등록된 금칙어입니다.");
      }
      console.error("banned-words POST 실패:", error);
      return errorResponse(500, "INSERT_FAILED", "금칙어 추가에 실패했습니다.");
    }

    return okResponse(toRow(data as Record<string, unknown>), 201);
  } catch (error) {
    console.error("banned-words POST 오류:", error);
    return errorResponse(500, "INTERNAL_ERROR", "처리 중 오류가 발생했습니다.");
  }
}

// ---------------------------------------------------------------------------
// DELETE — 금칙어 삭제 (?id=uuid)
// ---------------------------------------------------------------------------
export async function DELETE(request: Request) {
  const guard = await requirePermission("bannedWords.manage");
  if (guard.response) return guard.response;

  const url = new URL(request.url);
  const parsed = deleteSchema.safeParse({ id: url.searchParams.get("id") });
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return errorResponse(
      400,
      "VALIDATION_ERROR",
      first?.message ?? "id 가 올바르지 않습니다.",
    );
  }

  const supabase = createServiceClient();
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .delete()
      .eq("id", parsed.data.id)
      .select("id")
      .maybeSingle();

    if (error) {
      console.error("banned-words DELETE 실패:", error);
      return errorResponse(500, "DELETE_FAILED", "금칙어 삭제에 실패했습니다.");
    }
    if (!data) {
      return errorResponse(404, "NOT_FOUND", "해당 금칙어를 찾을 수 없습니다.");
    }

    return okResponse({ id: String(data.id), deleted: true });
  } catch (error) {
    console.error("banned-words DELETE 오류:", error);
    return errorResponse(500, "INTERNAL_ERROR", "처리 중 오류가 발생했습니다.");
  }
}
