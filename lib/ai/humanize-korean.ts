// ============================================================================
// lib/ai/humanize-korean — 한국어 윤문(im-not-ai 룰북, 사용자 지시 2026-09-08)
//
// AI 가 만든 한국어(팟캐 대본 등)를 사람 글처럼 다듬는다. 룰북은 lib/ai/humanize/quick-rules.md
// (im-not-ai, MIT). 구독 CLI(codex/claude, lib/ai/local-cli)로 한 콜에 탐지·윤문·자체검증.
// 안전장치: 사실·숫자·고유명사·직접 인용·문단 수 보존을 지시하고, 결과가 원문 대비 50% 넘게
// 바뀌었거나 길이가 60~140% 를 벗어나면 원문을 그대로 쓴다(과윤문 가드 — im-not-ai 와 같은 기준).
// CLI 가 없거나 실패하면 원문 반환(파이프라인을 막지 않는다).
// ============================================================================

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { generateJsonViaCli, isLocalCliMode } from "./local-cli";

/** 룰북 경로 — 서버는 프로젝트 루트에서 실행되므로 cwd 기준(번들에 md 가 안 실리기 때문) */
const RULES_PATH = join(process.cwd(), "lib", "ai", "humanize", "quick-rules.md");
let rulesCache: string | null = null;

async function loadRules(): Promise<string> {
  if (rulesCache) return rulesCache;
  try {
    rulesCache = await readFile(RULES_PATH, "utf8");
  } catch (error) {
    console.error("[humanize] 룰북을 읽지 못했습니다:", error instanceof Error ? error.message : String(error));
    rulesCache = "";
  }
  return rulesCache;
}

const HumanizedSchema = z.object({
  text: z.string().min(1),
  /** 손본 패턴 ID 목록(로그용) — 예: ["A-1","D-1"] */
  applied: z.array(z.string()).optional(),
});

export type HumanizeGenre = "radio-script" | "summary";

/** 두 문자열의 대략적 변경률(0~1) — 문장 단위 집합 비교 */
function changeRate(a: string, b: string): number {
  const split = (t: string) => new Set(t.replace(/\s+/g, " ").split(/(?<=[.!?。])\s|\n+/).map((s) => s.trim()).filter(Boolean));
  const sa = split(a);
  const sb = split(b);
  if (sa.size === 0) return 0;
  let same = 0;
  for (const s of sa) if (sb.has(s)) same += 1;
  return 1 - same / sa.size;
}

/**
 * 한국어 윤문. 실패·과윤문이면 원문을 그대로 돌려준다.
 * @param text 원문
 * @param genre radio-script(팟캐 대본: 구어체·문단 유지) | summary(요약문)
 */
export async function humanizeKorean(
  text: string,
  genre: HumanizeGenre = "radio-script",
): Promise<{ text: string; changed: boolean; applied: string[] }> {
  const original = text.trim();
  if (!original || !isLocalCliMode()) return { text: original, changed: false, applied: [] };
  const rules = await loadRules();
  if (!rules) return { text: original, changed: false, applied: [] };

  const genreNote =
    genre === "radio-script"
      ? "장르: 지역 방송 라디오 뉴스 대본(아나운서가 읽는 구어체 '~입니다/~습니다'). 문단 구분과 순서를 그대로 유지하고 새 문단·불릿·소제목을 만들지 마라. 청취자에게 읽어 주는 글이므로 괄호 병기·기호를 쓰지 마라."
      : "장르: 기사 요약문(서술체). 문장 수를 크게 늘리거나 줄이지 마라.";

  const system = [
    "너는 한국어 윤문가다. 아래 룰북(im-not-ai quick-rules)에 따라 AI 티(번역투·기계적 대구·상투 관용구·연결어미 쉼표 등)를 찾아 사람이 쓴 글처럼 다듬는다.",
    "반드시 지킬 것: 사실·숫자·날짜·단위·고유명사·기관명·직접 인용은 한 글자도 바꾸지 않는다. 내용을 더하거나 빼지 않는다. 주장의 강도(서법)를 바꾸지 않는다. 변경률은 30% 이내를 목표로 하고 확신 없는 문장은 그대로 둔다.",
    genreNote,
    "",
    "=== 룰북 ===",
    rules,
  ].join("\n");

  const result = await generateJsonViaCli(HumanizedSchema, {
    system,
    prompt: `다음 글을 윤문하라.\n\n=== 원문 ===\n${original}\n=== 끝 ===`,
    format: '{"text": "<윤문 결과 전체 — 원문과 같은 문단 구조>", "applied": ["<손본 룰 ID>", ...]}',
    label: "humanize-korean",
  });
  if (!result) return { text: original, changed: false, applied: [] };

  const out = result.text.trim();
  const ratio = out.length / original.length;
  const rate = changeRate(original, out);
  if (ratio < 0.6 || ratio > 1.4 || rate > 0.5) {
    console.warn(`[humanize] 과윤문 가드 — 길이 ${(ratio * 100).toFixed(0)}%, 변경률 ${(rate * 100).toFixed(0)}% → 원문 유지`);
    return { text: original, changed: false, applied: [] };
  }
  return { text: out, changed: out !== original, applied: result.applied ?? [] };
}
