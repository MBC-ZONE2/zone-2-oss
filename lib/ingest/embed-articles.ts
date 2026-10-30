// ============================================================================
// lib/ingest/embed-articles — 기사 임베딩 생성 (lib/ai.embed 호출)
//
// docs/07 T1.2: articles.embedding(pgvector) 채우기.
// 임베딩 텍스트 = 제목 + 본문(있으면). lib/ai 의 embed() 를 배치 호출한다.
//
// ⚠️ embed() 는 Phase 0 스텁이라 키 없이는 throw 한다. 수집 자체(DemoAdapter
//    적재)는 키 없이도 동작해야 하므로(담당 규칙), 임베딩 실패는 치명적
//    오류로 보지 않고 embedding=null 로 적재를 계속한다.
// ============================================================================

import { embed } from "@/lib/ai";
import type { ArticleRow } from "./normalize";

/** 임베딩 입력 텍스트 구성: 제목 + 본문 */
function toEmbeddingText(row: ArticleRow): string {
  const parts = [row.title, row.body ?? ""];
  return parts.join("\n\n").trim();
}

export interface EmbedArticlesResult {
  /** 임베딩이 채워진(또는 null 인) row 목록 — 입력과 동일 순서·길이 */
  rows: ArticleRow[];
  /** 임베딩 성공 여부 */
  embedded: boolean;
  /** 실패 시 사유(로그용) */
  error?: string;
}

/**
 * 기사 row 배열에 임베딩을 채운다.
 *
 * - 빈 입력이면 즉시 반환.
 * - embed() 가 성공하면 입력 순서대로 매핑.
 * - 길이가 안 맞거나 throw 하면 embedding=null 유지하고 계속 진행(멱등·내결함).
 */
export async function embedArticles(
  rows: ArticleRow[],
): Promise<EmbedArticlesResult> {
  if (rows.length === 0) {
    return { rows, embedded: false };
  }

  const texts = rows.map(toEmbeddingText);

  try {
    const vectors = await embed(texts);

    // 응답 길이 검증 — 어긋나면 신뢰할 수 없으므로 임베딩 생략
    if (!Array.isArray(vectors) || vectors.length !== rows.length) {
      return {
        rows,
        embedded: false,
        error: `embed() 응답 길이 불일치: expected ${rows.length}, got ${
          Array.isArray(vectors) ? vectors.length : "non-array"
        }`,
      };
    }

    const withEmbedding = rows.map((row, i) => ({
      ...row,
      embedding: Array.isArray(vectors[i]) ? vectors[i] : null,
    }));

    return { rows: withEmbedding, embedded: true };
  } catch (error) {
    // 키 미설정(스텁 throw) 등 — 적재는 계속한다.
    const message = error instanceof Error ? error.message : String(error);
    return { rows, embedded: false, error: message };
  }
}
