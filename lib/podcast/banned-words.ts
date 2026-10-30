// ============================================================================
// lib/podcast/banned-words — 팟캐스트 스크립트 금칙어 QA
//
// 처리 파이프라인 5단계(Script QA): 금칙어 필터.
// 혐오/욕설 어근은 공용 시드 사전(lib/moderation/banned-words.ts)을 재사용하고,
// 방송 대본 특화 표현만 여기에 추가한다.
// ⚠️ spam 계열(카지노·토토 등)은 제외 — 지역 뉴스 대본이 해당 단어를 보도
//    문맥으로 정당하게 포함할 수 있어(예: 사행산업 규제 기사) 오탐 위험.
// ============================================================================

import { BANNED_WORDS } from "@/lib/moderation/banned-words";
import type { QaResult } from "./types";

/** 방송 대본 특화 추가 금칙어 (공용 사전에 없는 표현) */
const PODCAST_EXTRA_WORDS: readonly string[] = [
  "닥쳐",
  "꺼져",
  "한남",
  "한녀",
  "틀딱",
  "급식충",
  "맘충",
];

/**
 * 기본 금칙어 사전 (한국어).
 * 공용 시드의 hate 계열 + 방송 특화 표현. 중복은 Set 으로 제거.
 * 실제 운영 사전은 관리자 API(/api/admin/banned-words)로 관리한다.
 */
export const DEFAULT_BANNED_WORDS: readonly string[] = [
  ...new Set([
    ...BANNED_WORDS.filter((w) => w.reason === "hate").map((w) => w.word),
    ...PODCAST_EXTRA_WORDS,
  ]),
];

/** 정규식 특수문자 이스케이프 */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 스크립트에서 금칙어를 검사한다.
 * @param script 검사 대상 스크립트
 * @param dictionary 사용할 금칙어 목록 (기본 DEFAULT_BANNED_WORDS)
 */
export function checkBannedWords(
  script: string,
  dictionary: readonly string[] = DEFAULT_BANNED_WORDS,
): QaResult {
  if (!script) return { ok: true, hits: [] };

  const hits = new Set<string>();
  for (const word of dictionary) {
    if (!word) continue;
    // 단순 부분 문자열 매칭 (한국어는 단어 경계 개념이 약해 substring 검사가 안전)
    if (script.includes(word)) {
      hits.add(word);
    }
  }

  return { ok: hits.size === 0, hits: [...hits] };
}

/**
 * 검출된 금칙어를 길이만큼 ●로 마스킹한다.
 * 검수자가 원문 맥락을 볼 수 있도록 스크립트를 폐기하지 않고 마스킹만 한다.
 */
export function maskBannedWords(
  script: string,
  dictionary: readonly string[] = DEFAULT_BANNED_WORDS,
): string {
  let masked = script;
  for (const word of dictionary) {
    if (!word) continue;
    const pattern = new RegExp(escapeRegExp(word), "g");
    masked = masked.replace(pattern, "●".repeat(word.length));
  }
  return masked;
}
