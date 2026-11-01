// ============================================================================
// lib/ai/summarize — 크로스뷰 페어 요약 (Claude)
//
// 시그니처 출처: docs/06-API명세.md §7
// 모든 호출은 Cloudflare AI Gateway 경유 (타임아웃·재시도·캐싱 적용 예정).
// 개발 모드(AI_MOCK=1 또는 ANTHROPIC_API_KEY 없음)에서는 더미 한국어 요약을 낸다.
// ============================================================================

import { generateObject } from "ai";
import { z } from "zod";
import { region } from "@/config/region";
import type { Article } from "@/types";
import { CLAUDE_MODEL, getAnthropic } from "./gateway";
import { generateJsonViaCli, isLocalCliMode } from "./local-cli";
import { isMockMode } from "./mock";

/** 본문 토큰 절감용 클립 길이. */
const BODY_CLIP = 1500;

/** Claude 구조화 출력 스키마: 광역/기초 관점 요약 + 리딩 포인트. */
const CrossviewSchema = z.object({
  macro: z
    .string()
    .describe("광역(도 단위) 매체 관점 요약. 2~3문장 한국어."),
  micro: z
    .string()
    .describe("기초(지역) 매체 관점 요약. 2~3문장 한국어."),
  readingPoint: z
    .string()
    .describe("'같은 정책, 두 개의 현실' 식 한 줄 리딩 포인트. 한국어."),
});

/** 본문에서 앞 n문장(…다. 기준)을 발췌한다 — 없으면 앞부분을 자른다 */
function leadSentences(body: string | null, count: number): string | null {
  const text = (body ?? "").trim();
  if (!text) return null;
  const parts = text.split(/(?<=다\.)\s+/).filter(Boolean);
  if (parts.length === 0) return text.slice(0, 160);
  return parts.slice(0, count).join(" ");
}

/** 제목의 앞 구절(말줄임 전)에서 따옴표를 벗겨 헤드라인 소재로 쓴다 */
function titleCore(title: string): string {
  const head = title.split(/…|\.\.\./)[0] ?? title;
  return head.replace(/^["'“”]+|["'“”]+$/g, "").trim();
}

/**
 * mock 요약 — 실제 LLM 요약이 아니다(키 없는 데모·파이프라인 구동용).
 * 데모 표식은 화면 텍스트가 아닌 코드 주석·mock 판정으로만 남긴다:
 * 요약은 각 기사 본문 앞 문장 발췌, 리딩 포인트는 기초 제목(가장
 * 생생한 문장)의 헤드라인화 — 전부 결정적.
 */
function mockSummary(
  macro: Article,
  micro: Article,
): { macro: string; micro: string; readingPoint: string } {
  const macroLead =
    leadSentences(macro.body, 2) ??
    `도(道) 차원의 정책·예산 흐름에서 "${macro.title}" 사안을 짚는다.`;
  const microLead =
    leadSentences(micro.body, 2) ??
    `주민의 체감과 현장 변화 중심으로 "${micro.title}" 사안을 전한다.`;
  return {
    macro: macroLead,
    micro: microLead,
    readingPoint: `"${titleCore(micro.title)}" — 같은 사안, 두 개의 시선`,
  };
}

/**
 * 크로스뷰 페어 요약 (Claude). 광역/기초 관점 요약 + 리딩 포인트 생성.
 */
export async function summarizeCrossview(
  macro: Article,
  micro: Article,
): Promise<{ macro: string; micro: string; readingPoint: string }> {
  // [구독 CLI] 키 없이 실제 요약. 실패하면 아래 로컬 폴백(제목 기반)으로 내려간다.
  if (isLocalCliMode()) {
    const viaCli = await generateJsonViaCli(CrossviewSchema, {
      label: "summarize",
      system:
        `당신은 ${region.place.province} 지역 뉴스를 정리하는 한국어 에디터다. 같은 사안을 광역(도 단위) ` +
        "매체와 기초(지역) 매체가 어떻게 다르게 다루는지 대비해 요약한다. " +
        "광역은 정책·예산·행정의 큰 그림, 기초는 주민 체감·현장 변화에 초점을 둔다. " +
        "사실에 근거해 간결한 한국어로 작성하라. 제목을 그대로 되풀이하지 마라.",
      prompt:
        `[광역 매체 기사]\n제목: ${macro.title}\n본문: ${(macro.body ?? "").slice(0, BODY_CLIP)}\n\n` +
        `[기초 매체 기사]\n제목: ${micro.title}\n본문: ${(micro.body ?? "").slice(0, BODY_CLIP)}`,
      format:
        '{"macro":"광역 관점 요약 2~3문장","micro":"기초 관점 요약 2~3문장",' +
        '"readingPoint":"두 기사의 관점 차이를 한 줄로"}',
    });
    if (viaCli) return viaCli;
  }

  // [MOCK] 키 없이 크로스뷰 카드 구동용 더미 한국어 요약 (결정적)
  if (isMockMode("anthropic")) {
    return mockSummary(macro, micro);
  }

  // 실제 호출: Claude 가 같은 사안에 대한 광역/기초 관점을 각각 요약.
  const anthropic = getAnthropic();
  const { object } = await generateObject({
    model: anthropic(CLAUDE_MODEL),
    schema: CrossviewSchema,
    schemaName: "CrossviewSummary",
    system:
      `당신은 ${region.place.province} 지역 뉴스를 정리하는 한국어 에디터다. 같은 사안을 광역(도 단위) ` +
      "매체와 기초(지역) 매체가 어떻게 다르게 다루는지 대비해 요약한다. " +
      "광역은 정책·예산·행정의 큰 그림, 기초는 주민 체감·현장 변화에 초점을 둔다. " +
      "사실에 근거해 간결한 한국어로 작성하라.",
    prompt:
      `[광역 매체 기사]\n제목: ${macro.title}\n본문: ${(macro.body ?? "").slice(0, BODY_CLIP)}\n\n` +
      `[기초 매체 기사]\n제목: ${micro.title}\n본문: ${(micro.body ?? "").slice(0, BODY_CLIP)}`,
  });

  return {
    macro: object.macro,
    micro: object.micro,
    readingPoint: object.readingPoint,
  };
}
