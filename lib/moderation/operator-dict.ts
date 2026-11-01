// ============================================================================
// lib/moderation/operator-dict — 운영 사전(DB) 로더 (서버 전용)
//
// /api/admin/banned-words 로 운영자가 등록한 금칙어를 읽어
// moderateText(text, extraDict) 의 extraDict 로 주입한다.
// banned_words 는 공개 정책이 없는 테이블이라 service_role 로만 읽는다.
//
// 로드 실패 시 빈 배열을 돌려 시드 사전만으로 검사한다(fail-open) —
// 사전 조회 장애가 게시글 작성 자체를 막으면 안 되고,
// 시드 사전 + AI 판정이 방어선으로 남는다(lib/moderation/index.ts 정책과 동일).
// ============================================================================

import { createServiceClient } from "@/lib/supabase/server";
import type { BannedWord, BannedWordReason } from "./banned-words";

/** 운영 사전(DB) 전체를 로드한다. 실패 시 빈 배열(fail-open). */
export async function loadOperatorDict(): Promise<BannedWord[]> {
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("banned_words")
      .select("word, reason");

    if (error) {
      console.error("[moderation] 운영 사전 로드 실패:", error.message);
      return [];
    }

    return (data ?? [])
      .filter(
        (row): row is { word: string; reason: BannedWordReason } =>
          typeof row.word === "string" &&
          (row.reason === "hate" || row.reason === "spam"),
      )
      .map((row) => ({ word: row.word, reason: row.reason }));
  } catch (error) {
    console.error("[moderation] 운영 사전 로드 오류:", error);
    return [];
  }
}
