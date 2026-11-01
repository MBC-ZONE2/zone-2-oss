// ============================================================================
// lib/ai/podcast — 팟캐스트 스크립트 생성 (Claude)
//
// 시그니처 출처: docs/06-API명세.md §7
// 모든 호출은 Cloudflare AI Gateway 경유 (타임아웃·재시도·캐싱 적용 예정).
// 개발 모드(AI_MOCK=1 또는 ANTHROPIC_API_KEY 없음)에서는 더미 한국어 스크립트를 낸다.
// ============================================================================

import { generateObject } from "ai";
import { z } from "zod";
import { region } from "@/config/region";
import type { Article } from "@/types";
import { CLAUDE_MODEL, getAnthropic } from "./gateway";
import { generateJsonViaCli, isLocalCliMode } from "./local-cli";
import { isMockMode } from "./mock";

/** 기사 본문 토큰 절감용 클립 길이. */
const BODY_CLIP = 1200;

const SERIES = region.podcast.seriesName;
const CORNER = region.podcast.localCorner;
const CORNER_LEAD = region.podcast.localCornerLead;
const MACRO = region.outlets.macro.name;
const MICRO = region.outlets.micro.name;
const PLACE = region.place.name;
const PROVINCE = region.place.province;
/** "다음 옥천신문 발행(목·금)" — 발행 주기 메모가 없으면 괄호도 없다 */
const MICRO_NEXT_ISSUE = `다음 ${MICRO} 발행${region.outlets.micro.cadenceNote ? `(${region.outlets.micro.cadenceNote})` : ""}`;

/** Claude 구조화 출력 스키마: 에피소드 제목 + 나레이션 스크립트. */
const PodcastSchema = z.object({
  title: z
    .string()
    .describe(`에피소드 제목. 예: "${SERIES} 10월 30일"`),
  script: z
    .string()
    .describe("진행자 1인 나레이션 한국어 스크립트(인사-본문-마무리). 수백 자 이상."),
});

/** 팟캐스트 스크립트 생성 입력 — 구조는 그룹 C에서 확정 */
export interface PodcastInput {
  /** 사용할 기사 */
  articles: Article[];
  /** 대상 날짜 (예: "2025-10-30") */
  date?: string;
  /** 참고 댓글/기타 컨텍스트 */
  context?: unknown;
  /** 승인 크로스뷰 쌍(광역 id·기초 id) — 첫 사안으로, 같은 번호끼리 대비해 다룬다(#166 ③) */
  pairs?: { macroId: string; microId: string }[];
  /** 옥천 소식이 없는 날 "오늘의 옥천" 코너를 채울 군청 공고 마감 */
  okNotices?: { title: string; deadline: string }[];
}

/** 매체 라벨 — 대본 모델이 광역/기초를 구분할 근거(#166: 라벨이 없어 "온도 차" 지시가 작동하지 않았다) */
const SOURCE_LABEL: Record<Article["source"], string> = {
  mbc_cb: `${MACRO}·${region.outlets.macro.tier}`,
  okinews: `${MICRO}·${region.outlets.micro.tier}`,
};

/**
 * 대본 구조 지시 — 인사 → 헤드라인 → 충북 사안(크로스뷰 쌍 먼저) → **오늘의 옥천** → 마무리.
 * 옥천 기사가 있으면 그 코너에서 옥천신문 기사를 다루고, 없으면 공고 마감 한 줄로 채운다(코너는 항상 있다).
 */
function structureInstruction(input: PodcastInput): string {
  const pairedIds = new Set((input.pairs ?? []).flatMap((p) => [p.macroId, p.microId]));
  // 옥천 코너 몫 = 쌍에 안 든 옥천신문 기사(쌍 기사는 첫 꼭지에서 이미 다룬다)
  const okCorner = input.articles.filter((a) => a.source === "okinews" && !pairedIds.has(a.id));
  const hasPair = pairedIds.size > 0;
  const hasNotice = (input.okNotices?.length ?? 0) > 0;
  const corner = okCorner.length > 0
    ? `「${CORNER}」 코너에서는 [${SOURCE_LABEL.okinews}] 기사 중 크로스뷰 쌍이 아닌 것을 모두 다룬다(쌍 기사는 앞에서 다뤘으니 되풀이하지 말고 한 마디로 잇기만). 이 코너의 첫 문장은 반드시 "${CORNER_LEAD}" 로 시작한다. 지명 '${PLACE}'을 문장에 자연스럽게 넣어라.`
    : hasNotice
      ? `오늘은 ${MICRO} 새 기사가 없다. 「${CORNER}」 코너는 "${CORNER_LEAD}" 로 시작해 아래 [${PLACE} 공고 마감] 에 적힌 공고만 한두 문장으로 알리고(없는 공고를 지어내지 말 것), ${MICRO_NEXT_ISSUE}에 다시 전하겠다고 짧게 맺어라.`
      : `오늘은 ${MICRO} 새 기사도 임박한 ${PLACE} 공고도 없다. 「${CORNER}」 코너는 "${CORNER_LEAD}" 로 시작해 확인된 새 소식이 없음을 한 문장으로 말하고, ${MICRO_NEXT_ISSUE}에 다시 전하겠다고 맺어라 — 소식을 지어내지 말 것.`;
  return [
    `구성: 인사 → 오늘의 헤드라인 → ${PROVINCE} 사안 해설 → 「${CORNER}」 코너 → 마무리 인사.`,
    hasPair
      ? `${PROVINCE} 사안의 첫 꼭지는 [크로스뷰 쌍 N] 표시가 붙은 기사들이다 — 같은 번호 N 의 광역(${MACRO})·기초(${MICRO}) 기사 둘이 한 사안이니, 쌍마다 두 매체가 어떻게 다르게 전했는지 대비해 풀어라.`
      : `${PROVINCE} 사안은 ${MACRO} 기사를 중심으로 하되, ${MICRO} 기사와 겹치는 사안이 있으면 광역·기초의 시각 차이를 짚어라.`,
    corner,
    `각 기사는 매체 라벨대로 출처를 밝힌다("${MICRO} 보도에 따르면", "${MACRO}이 전한" 등). 유튜브 기사도 ${MACRO} 보도로 소개한다.`,
  ].join(" ");
}

/** "오늘의 옥천" 코너용 공고 마감 블록(옥천 기사가 없는 날만) */
function noticeBlock(input: PodcastInput): string {
  const list = input.okNotices ?? [];
  if (list.length === 0) return "";
  const lines = list.map((n) => `- ${n.title} (마감 ${n.deadline})`).join("\n");
  return `\n\n[${PLACE} 공고 마감]\n${lines}`;
}

/**
 * "2025-10-30" → "10월 30일" (없거나 형식 불명이면 "오늘").
 * 에피소드 제목을 서버에서 결정론적으로 만들 때도 쓰므로 export 한다
 * (lib/podcast/generate — AI 가 낸 제목의 날짜를 신뢰하지 않는다).
 */
export function toKoreanDate(date?: string): string {
  if (!date) return "오늘";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return "오늘";
  return `${Number(match[2])}월 ${Number(match[3])}일`;
}

/**
 * [MOCK] 입력 기사 제목들로 구성한 수백 자 분량의 더미 한국어 스크립트.
 * 실제 LLM 생성물이 아니다(에피소드 생성·TTS·검수 큐 파이프라인 구동용).
 */
function mockScript(input: PodcastInput): { title: string; script: string } {
  const koreanDate = toKoreanDate(input.date);
  // 데모 표식은 화면 텍스트가 아니라 코드 주석·mock 판정으로만 남긴다
  // (시연 화면 오염 방지 — 실호출 전환 시 이 함수 자체가 미사용).
  const title = `${SERIES} ${koreanDate}`;

  const titles = input.articles.map((a) => a.title);
  const headlineList =
    titles.length > 0
      ? titles.map((t, i) => `${i + 1}. ${t}`).join("\n")
      : "1. (오늘 다룰 기사가 아직 수집되지 않았습니다)";

  // 실제 대본과 같은 구조(#166): 충북 사안(MBC충북) → 「오늘의 옥천」 코너(옥천신문, 없으면 공고 마감/없음)
  const mbcTitles = input.articles.filter((a) => a.source !== "okinews").map((a) => a.title);
  const okTitles = input.articles.filter((a) => a.source === "okinews").map((a) => a.title);
  const mbcPart =
    mbcTitles.length > 0
      ? mbcTitles
          .map((t) => `이어서 ${MACRO}이 전한 "${t}" 소식입니다. 광역의 큰 그림과 기초 현장의 온도 차를 함께 짚어 보겠습니다.`)
          .join(" ")
      : `오늘은 준비된 ${PROVINCE} 기사가 없어 지난 이슈를 정리하는 시간으로 채워 보겠습니다.`;
  const okPart =
    okTitles.length > 0
      ? `${CORNER_LEAD} ${okTitles.map((t) => `${MICRO} 보도에 따르면 "${t}" 소식이 있습니다.`).join(" ")}`
      : (input.okNotices?.length ?? 0) > 0
        ? `${CORNER_LEAD} 오늘은 ${MICRO} 새 기사가 없어 임박한 ${region.government.name} 공고를 전합니다. ${input.okNotices!.map((n) => `"${n.title}" 은 ${n.deadline} 마감입니다.`).join(" ")} 다음 ${MICRO} 발행 때 다시 전하겠습니다.`
        : `${CORNER_LEAD} 오늘은 확인된 ${PLACE} 새 소식이 없습니다. 다음 ${MICRO} 발행 때 다시 전하겠습니다.`;
  const topicSentences = `${mbcPart} ${okPart}`;

  const script = [
    `안녕하세요, ${PROVINCE}의 하루를 정리해 드리는 "${SERIES}" ${koreanDate} 방송입니다.`,
    `오늘 다룰 주요 소식은 다음과 같습니다.\n${headlineList}`,
    topicSentences,
    `지금까지의 흐름을 보면, 도 차원의 정책 발표가 실제 지역 현장에서는 조금씩 다른 속도로 체감되고 있다는 점이 눈에 띕니다. 같은 정책이라도 광역의 큰 그림과 기초의 생활 현장 사이에는 분명한 온도 차가 존재합니다.`,
    `청취자 여러분께서도 오늘 전해 드린 소식들이 우리 동네에서는 어떻게 다가오는지 한 번쯤 떠올려 보시면 좋겠습니다. 지금까지 "${SERIES}"이었습니다. 내일도 ${PROVINCE}의 이야기로 다시 찾아뵙겠습니다. 고맙습니다.`,
  ].join("\n\n");

  return { title, script };
}

/** 입력 기사들을 프롬프트용 목록 블록으로 — 매체 라벨(+크로스뷰 쌍 표시)을 앞에 붙인다. */
function articleBlock(input: PodcastInput): string {
  if (input.articles.length === 0) return "(오늘 다룰 기사가 수집되지 않았습니다)";
  const pairNo = new Map<string, number>();
  (input.pairs ?? []).forEach((p, i) => {
    pairNo.set(p.macroId, i + 1);
    pairNo.set(p.microId, i + 1);
  });
  return input.articles
    .map(
      (a, i) =>
        `${i + 1}. [${SOURCE_LABEL[a.source] ?? a.source}${pairNo.has(a.id) ? ` · 크로스뷰 쌍 ${pairNo.get(a.id)}` : ""}] 제목: ${a.title}\n   본문: ${(a.body ?? "").slice(0, BODY_CLIP)}`,
    )
    .join("\n");
}

/**
 * 팟캐스트 스크립트 생성 (Claude).
 */
export async function generatePodcastScript(
  input: PodcastInput,
): Promise<{ title: string; script: string }> {
  // [구독 CLI] 키 없이 실제 대본 생성. 실패하면 아래 더미 스크립트로 내려간다.
  if (isLocalCliMode()) {
    const koreanDateForCli = toKoreanDate(input.date);
    const viaCli = await generateJsonViaCli(PodcastSchema, {
      label: "podcast",
      system:
        `당신은 ${PROVINCE} 지역 뉴스 라디오 "${SERIES}"의 1인 진행자다. ${koreanDateForCli} 방송 대본을 쓴다. ` +
        structureInstruction(input) +
        " 광역의 큰 그림과 기초 현장의 온도 차를 강조하고, 듣기 자연스러운 구어체 한국어 나레이션을 작성하라. " +
        "사실에 근거하고 과장·허위는 피한다. 효과음/음악 지시문은 넣지 않는다.",
      prompt:
        `방송 날짜: ${koreanDateForCli}\n\n[오늘 다룰 기사]\n${articleBlock(input)}` +
        noticeBlock(input) +
        contextSection(input.context),
      format:
        `{"title":"${SERIES} ${koreanDateForCli}","script":"대본 전문(줄바꿈은 \\\\n)"}`,
    });
    if (viaCli) return viaCli;
  }

  // [MOCK] 키 없이 팟캐스트 생성/검수 파이프라인 구동용 더미 스크립트
  if (isMockMode("anthropic")) {
    return mockScript(input);
  }

  // 실제 호출: Claude 가 입력 기사들로 1인 진행 라디오 대본을 생성.
  const anthropic = getAnthropic();
  const koreanDate = toKoreanDate(input.date);

  const { object } = await generateObject({
    model: anthropic(CLAUDE_MODEL),
    schema: PodcastSchema,
    schemaName: "PodcastEpisode",
    system:
      `당신은 ${PROVINCE} 지역 뉴스 라디오 "${SERIES}"의 1인 진행자다. ${koreanDate} 방송 대본을 쓴다. ` +
      structureInstruction(input) +
      " 광역의 큰 그림과 기초 현장의 온도 차를 강조하고, 듣기 자연스러운 구어체 한국어 나레이션을 작성하라. " +
      "사실에 근거하고 과장·허위는 피한다. 효과음/음악 지시문은 넣지 않는다.",
    prompt:
      `방송 날짜: ${koreanDate}\n\n[오늘 다룰 기사]\n${articleBlock(input)}` +
      noticeBlock(input) +
      contextSection(input.context),
  });

  return { title: object.title, script: object.script };
}

/** 참고 컨텍스트가 있을 때만 머리말과 함께 붙인다(양 경로 공통). */
function contextSection(context: unknown): string {
  const block = serializeContext(context);
  return block ? `\n\n[참고 컨텍스트]\n${block}` : "";
}

/** 자유 형식 context 를 프롬프트용 문자열로 안전 변환(실패 시 빈 문자열). */
function serializeContext(context: unknown): string {
  if (context == null) return "";
  if (typeof context === "string") return context.slice(0, 2000);
  try {
    return JSON.stringify(context).slice(0, 2000);
  } catch {
    return "";
  }
}
