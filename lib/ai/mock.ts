// ============================================================================
// lib/ai/mock — 개발용 더미(mock) 구현 공용 헬퍼
//
// 목적: 실제 API 키 없이 로컬에서 파이프라인(수집→임베딩→매칭→감정→팟캐스트)을
//       끝까지 돌리기 위한 결정적(deterministic) 더미 응답 생성기.
//
// 활성 조건(각 lib/ai/* 함수에서 판단):
//   - process.env.AI_MOCK === "1"  또는
//   - 해당 provider 키(ANTHROPIC_API_KEY / OPENAI_API_KEY)가 없음
//
// 결정성: Math.random 을 쓰지 않는다. 입력 텍스트 해시를 시드로 사용해
//         같은 입력이면 항상 같은 출력을 내도록 한다(테스트·재현 용이).
// ⚠️ 실제 AI 응답이 아니다. 형태(shape)·타입만 실제와 동일하게 맞춘다.
// ============================================================================

import type { AiProvider } from "./gateway";

/**
 * mock 모드 여부 판정.
 * AI_MOCK=1 이면 무조건 mock, 아니면 provider 키 존재 여부로 결정한다.
 * @param provider 키 존재를 확인할 공급자. 생략 시 AI_MOCK 플래그만 본다.
 */
export function isMockMode(provider?: AiProvider): boolean {
  if (process.env.AI_MOCK === "1") return true;
  if (provider === "openai") return !process.env.OPENAI_API_KEY;
  if (provider === "anthropic") return !process.env.ANTHROPIC_API_KEY;
  return false;
}

/**
 * FNV-1a 32비트 해시. 문자열 → 부호 없는 32비트 정수(0 ~ 2^32-1).
 * 결정적이며 분포가 고른 편이라 시드/유사난수용으로 적합하다.
 */
export function hashString(input: string): number {
  let hash = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    // FNV prime 곱 (32비트 오버플로 유지)
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0; // unsigned 32-bit
}

/**
 * mulberry32 PRNG 팩토리. 시드(uint32)로 0~1 사이 의사난수 함수를 만든다.
 * 같은 시드 → 같은 수열. 결정적 mock 데이터 생성에 사용한다.
 */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return function next(): number {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 0~1 난수를 [min, max] 구간 값으로 매핑하고 소수 자릿수를 고정한다.
 */
export function scaleTo(
  value01: number,
  min: number,
  max: number,
  fractionDigits = 4,
): number {
  const scaled = min + value01 * (max - min);
  const factor = 10 ** fractionDigits;
  return Math.round(scaled * factor) / factor;
}
