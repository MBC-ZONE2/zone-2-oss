// ============================================================================
// lib/ai/moderate — 콘텐츠 모더레이션 (Claude)
//
// 시그니처 출처: docs/06-API명세.md §7
// 모든 호출은 Cloudflare AI Gateway 경유 (타임아웃·재시도·캐싱 적용 예정).
// 개발 모드(AI_MOCK=1 또는 ANTHROPIC_API_KEY 없음)에서는 더미 판정을 낸다.
// ============================================================================

import { generateObject } from "ai";
import { z } from "zod";
import { checkBannedWords } from "@/lib/moderation/banned-words";
import { CLAUDE_FAST_MODEL, getAnthropic } from "./gateway";
import { isMockMode } from "./mock";

/** Claude 구조화 출력 스키마: 플래그 여부 + 사유. */
const ModerationSchema = z.object({
  flagged: z.boolean().describe("부적절(차단 대상) 여부"),
  reason: z
    .enum(["bot", "spam", "hate", "violence", "sexual", "other"])
    .nullable()
    .describe("flagged=true 일 때의 사유. 아니면 null."),
});

/**
 * [MOCK] 기본은 flagged:false(통과).
 * 단, 시드 금칙어 사전에 명백히 걸리면 flagged:true 로 돌려 더 현실적인 더미 동작.
 * (lib/moderation 의 1차 사전 필터와는 별개로, AI 단계 mock 도 결정적으로 동작.)
 * 실제 LLM 맥락 판정이 아니다.
 */
function mockModeration(text: string): { flagged: boolean; reason?: string } {
  const hit = checkBannedWords(text);
  if (hit.matched && hit.reason) {
    return { flagged: true, reason: hit.reason };
  }
  return { flagged: false };
}

/**
 * 콘텐츠 모더레이션 (Claude). 공론장/팟캐스트 QA 공용.
 * @returns flagged 여부 + 사유(bot/spam/hate 등)
 */
export async function moderateContent(
  text: string,
): Promise<{ flagged: boolean; reason?: string }> {
  // [MOCK] 키 없이 공론장/팟캐스트 QA 배선 구동용 더미 판정 (결정적)
  if (isMockMode("anthropic")) {
    return mockModeration(text);
  }

  // 1차: 금칙어 사전 필터(결정적·저비용). 명백히 걸리면 LLM 호출 없이 즉시 차단.
  const dictHit = checkBannedWords(text);
  if (dictHit.matched && dictHit.reason) {
    return { flagged: true, reason: dictHit.reason };
  }

  // 2차: Claude(Haiku) 맥락 판정. 사전으로 못 잡는 우회·문맥 위반을 포착.
  const anthropic = getAnthropic();
  const { object } = await generateObject({
    model: anthropic(CLAUDE_FAST_MODEL),
    schema: ModerationSchema,
    schemaName: "Moderation",
    system:
      "당신은 한국어 공론장/팟캐스트 콘텐츠 모더레이터다. 텍스트가 봇/스팸/혐오/" +
      "폭력/성적 표현 등으로 부적절하면 flagged=true 와 사유를 반환한다. " +
      "정상적인 의견·비판은 차단하지 말고 flagged=false 로 둔다.",
    prompt: text,
  });

  if (!object.flagged) return { flagged: false };
  return { flagged: true, reason: object.reason ?? "other" };
}
