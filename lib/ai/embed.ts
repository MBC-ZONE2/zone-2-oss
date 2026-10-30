// ============================================================================
// lib/ai/embed — 텍스트 임베딩 (OpenAI text-embedding-3-small, 1536차원)
//
// 시그니처 출처: docs/06-API명세.md §7
// 모든 호출은 Cloudflare AI Gateway 경유 (타임아웃·재시도·캐싱 적용 예정).
// 개발 모드(AI_MOCK=1 또는 OPENAI_API_KEY 없음)에서는 결정적 더미 벡터를 낸다.
// ============================================================================

import { embedMany } from "ai";
import { getOpenAI, OPENAI_EMBEDDING_MODEL } from "./gateway";
import { isMockMode } from "./mock";
import { localEmbedding } from "./local-embed";

/**
 * 텍스트 임베딩 생성. OpenAI text-embedding-3-small (1536차원).
 * @returns 입력 순서와 동일한 임베딩 벡터 배열
 */
export async function embed(texts: string[]): Promise<number[][]> {
  // 키 없는 로컬: 문자 n-gram 기반 로컬 의미 임베딩(난수 아님 — 어휘 겹침으로 매칭).
  // 실제 신경망 임베딩만큼 정교하진 않지만 실수집 기사끼리 주제 매칭이 가능하다.
  if (isMockMode("openai")) {
    return texts.map(localEmbedding);
  }

  // 빈 입력은 호출 없이 즉시 반환(공급자 빈 배열 에러 방지).
  if (texts.length === 0) return [];

  // 실제 호출: OpenAI text-embedding-3-small (1536차원) via AI Gateway.
  // embedMany 는 입력 순서를 보존한 임베딩 배열을 돌려준다.
  const openai = getOpenAI();
  const { embeddings } = await embedMany({
    model: openai.embedding(OPENAI_EMBEDDING_MODEL),
    values: texts,
  });
  return embeddings;
}
