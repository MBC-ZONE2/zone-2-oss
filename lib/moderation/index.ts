// ============================================================================
// lib/moderation — 콘텐츠 모더레이션 (금칙어 사전 + Claude AI 병행)
//
// 담당: 통합 공론장(그룹 D). 게시글/댓글 작성 시 호출한다.
// 정책:
//   1) 금칙어 사전(lib/moderation/banned-words) — 빠르고 결정적. 즉시 플래그.
//   2) Claude moderateContent(lib/ai) — bot/spam/hate 등 맥락 판단.
//      ⚠️ Phase 0 스텁은 throw 하므로, AI 단계는 fail-open(에러 시 통과) 처리한다.
//      금칙어 사전이 1차 방어선이므로 AI 미구현이어도 안전.
// flag_reason 라벨: forum_posts.flag_reason = bot | spam | hate (docs/04).
// ============================================================================

import { moderateContent } from "@/lib/ai";
import {
  BANNED_WORDS,
  checkBannedWords,
  type BannedWord,
  type BannedWordReason,
} from "./banned-words";

export { checkBannedWords } from "./banned-words";
export type { BannedWord, BannedWordReason } from "./banned-words";

/** 모더레이션 사유 라벨 (forum_posts.flag_reason 호환) */
export type ModerationReason = "bot" | "spam" | "hate";

/** 모더레이션 판정 결과 */
export interface ModerationResult {
  /** 플래그 여부 */
  flagged: boolean;
  /** 플래그 사유 (flagged=true 일 때) */
  reason: ModerationReason | null;
  /** 판정 출처 — 디버깅/로그용 */
  source: "banned-words" | "ai" | "none";
}

const PASS: ModerationResult = {
  flagged: false,
  reason: null,
  source: "none",
};

/** 금칙어 사전 reason → ModerationReason (라벨은 동일) */
function toModerationReason(reason: BannedWordReason): ModerationReason {
  return reason; // 'hate' | 'spam' 은 ModerationReason 의 부분집합
}

/**
 * AI 모더레이션 호출(Claude). 스텁/네트워크 오류는 흡수하고 미플래그로 본다.
 * 실제 구현은 lib/ai/moderate(외부 키 연결 후)에서 채워진다.
 */
async function runAiModeration(text: string): Promise<ModerationResult> {
  try {
    const { flagged, reason } = await moderateContent(text);
    if (!flagged) return PASS;
    return {
      flagged: true,
      reason: normalizeAiReason(reason),
      source: "ai",
    };
  } catch {
    // Phase 0: moderateContent 미구현(throw) → fail-open. 사전 필터가 방어선.
    return PASS;
  }
}

/** AI 가 돌려준 자유 문자열 사유를 표준 라벨로 정규화 */
function normalizeAiReason(reason?: string): ModerationReason {
  const r = (reason ?? "").toLowerCase();
  if (r.includes("spam")) return "spam";
  if (r.includes("bot")) return "bot";
  if (r.includes("hate") || r.includes("toxic") || r.includes("abuse"))
    return "hate";
  return "hate"; // 사유 불명확하지만 flagged 면 보수적으로 hate 처리
}

/**
 * 콘텐츠 모더레이션 — 금칙어 사전 우선, 통과 시 AI 판정.
 * 게시글은 (title + body), 댓글은 (body) 를 합쳐 넘기면 된다.
 *
 * @param text   검사 대상 텍스트
 * @param extraDict 운영 사전(DB 로드분)을 시드 사전에 더해 검사
 */
export async function moderateText(
  text: string,
  extraDict: BannedWord[] = [],
): Promise<ModerationResult> {
  const trimmed = text.trim();
  if (trimmed.length === 0) return PASS;

  // 1) 금칙어 사전 — 시드 + 운영 사전(있으면)을 합쳐 즉시 플래그
  const dict =
    extraDict.length > 0 ? [...BANNED_WORDS, ...extraDict] : BANNED_WORDS;
  const hit = checkBannedWords(trimmed, dict);
  if (hit.matched && hit.reason) {
    return {
      flagged: true,
      reason: toModerationReason(hit.reason),
      source: "banned-words",
    };
  }

  // 2) Claude 맥락 판정 (스텁이면 통과)
  return runAiModeration(trimmed);
}
