// ============================================================================
// lib/matching/engine — 크로스뷰 매칭 파이프라인 (그룹 A 핵심)
//
// deliverables/01 §4 처리 로직:
//   신규 기사 → (임베딩 생성됨) → 반대 매체 pgvector Top-N(10)
//     → 발행일 ±7일 + 키워드 교집합 필터
//     → Claude 재랭킹(rerankMatches) "같은 이슈인가?" 점수
//     → 상위 maxPairs(5)건 확정, 점수 < 임계값(0.6)은 candidate 보관(게시 제외)
//     → Claude 요약(summarizeCrossview): 광역/기초 관점 + 리딩 포인트
//     → 카드뉴스(card_data) 생성
//     → crossview_pairs(status='candidate') 저장(upsert)
//
// ⚠️ AI 함수(rerankMatches/summarizeCrossview)는 Phase 0 스텁이다.
//    여기서는 "호출하는" 코드만 작성한다(구현은 스텁 유지).
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Article } from "@/types";
import { rerankMatches, summarizeCrossview } from "@/lib/ai";
import { recordAlert, resolveAlerts } from "@/lib/alerts";
import {
  DEFAULT_MATCH_OPTIONS,
  type MatchCandidate,
  type MatchOptions,
  type MatchResult,
  type MatchRunSummary,
} from "./types";
import { findCandidates } from "./candidates";
import { filterStoryDuplicates } from "./story";
import { buildCardData } from "./card";
import { toArticle, type ArticleRow } from "./mappers";

/** 매칭에 사용할 articles 컬럼 (embedding 포함) */
const ARTICLE_COLUMNS =
  "id, source, kind, external_id, url, title, body, category, keywords, published_at, embedding, raw, created_at";

/**
 * 최근 lookbackHours 내 생성된 신규 기사를 조회한다.
 * (멱등성: 이미 페어가 있어도 upsert(onConflict)로 중복 저장되지 않는다)
 */
async function fetchNewArticles(
  supabase: SupabaseClient,
  options: MatchOptions,
): Promise<Article[]> {
  const since = new Date(
    Date.now() - options.lookbackHours * 60 * 60 * 1000,
  ).toISOString();

  const { data, error } = await supabase
    .from("articles")
    .select(ARTICLE_COLUMNS)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    // 1회 실행 상한 — 백필 폭주(AI 호출·타임아웃) 방지. 나머지는 다음 실행이 처리.
    .limit(options.maxArticlesPerRun);

  if (error) {
    throw new Error(`신규 기사 조회 실패: ${error.message}`);
  }

  return ((data ?? []) as ArticleRow[]).map(toArticle);
}

/**
 * 기준 기사 + 후보들을 Claude 재랭킹 → 상위 maxPairs 확정 → 요약·카드까지 생성.
 * macro/micro 방향은 base.source 기준으로 정한다(mbc_cb=광역=macro).
 */
async function buildResultsForArticle(
  base: Article,
  candidates: MatchCandidate[],
  options: MatchOptions,
): Promise<{ results: MatchResult[]; belowThreshold: number }> {
  if (candidates.length === 0) {
    return { results: [], belowThreshold: 0 };
  }

  // 후보 기사 배열만 추출해 Claude 재랭킹 호출 (스텁: 호출부만 작성).
  const candidateArticles = candidates.map((c) => c.article);
  const ranked = await rerankMatches(base, candidateArticles);

  // 후보 id → 유사도 (재랭킹 결과와 합치기 위함)
  const similarityById = new Map(
    candidates.map((c) => [c.article.id, c.similarity]),
  );
  const articleById = new Map(
    candidateArticles.map((a) => [a.id, a]),
  );

  // 점수 내림차순 정렬 후 상위 maxPairs 확정.
  const topRanked = [...ranked]
    .sort((a, b) => b.score - a.score)
    .slice(0, options.maxPairs);

  const results: MatchResult[] = [];
  let belowThreshold = 0;

  for (const { id, score } of topRanked) {
    const candidate = articleById.get(id);
    if (!candidate) continue; // 재랭킹이 알 수 없는 id를 돌려준 경우 방어.

    if (score < options.scoreThreshold) {
      // 임계값 미만은 **검수 큐에 저장하지 않는다**(비매칭 clutter 방지).
      //   과거엔 candidate 로 보관했으나, rerank 캘리브레이션상 저득점은 오답이
      //   지배적(고득점=정답 상관 확립)이라 운영자 검수 대상에서 제외한다.
      //   belowThreshold 는 지표용으로만 집계한다.
      belowThreshold += 1;
      continue;
    }

    // macro = 광역(mbc_cb), micro = 기초(okinews) 방향 결정.
    const macro = base.source === "mbc_cb" ? base : candidate;
    const micro = base.source === "mbc_cb" ? candidate : base;

    // Claude 요약 호출 (스텁: 호출부만 작성).
    const summary = await summarizeCrossview(macro, micro);

    const cardData = buildCardData({
      macro,
      micro,
      summaryMacro: summary.macro,
      summaryMicro: summary.micro,
      readingPoint: summary.readingPoint,
    });

    results.push({
      articleMacro: macro.id,
      articleMicro: micro.id,
      similarity: similarityById.get(candidate.id) ?? 0,
      matchScore: score,
      summaryMacro: summary.macro,
      summaryMicro: summary.micro,
      readingPoint: summary.readingPoint,
      cardData,
    });
  }

  return { results, belowThreshold };
}

/** MatchResult → crossview_pairs upsert row (snake_case) */
function toPairRow(result: MatchResult) {
  return {
    article_macro: result.articleMacro,
    article_micro: result.articleMicro,
    similarity: result.similarity,
    match_score: result.matchScore,
    summary_macro: result.summaryMacro,
    summary_micro: result.summaryMicro,
    reading_point: result.readingPoint,
    card_data: result.cardData,
    status: "candidate" as const,
  };
}

/**
 * 매칭 결과를 crossview_pairs에 저장한다.
 * unique(article_macro, article_micro) 충돌 시 upsert로 멱등 처리.
 */
async function persistPairs(
  supabase: SupabaseClient,
  results: MatchResult[],
): Promise<number> {
  if (results.length === 0) return 0;

  const rows = results.map(toPairRow);
  const { error } = await supabase
    .from("crossview_pairs")
    .upsert(rows, { onConflict: "article_macro,article_micro" });

  if (error) {
    throw new Error(`crossview_pairs 저장 실패: ${error.message}`);
  }

  return rows.length;
}

/**
 * 크로스뷰 매칭 실행(엔트리포인트).
 * /api/cron/match 에서 service_role 클라이언트로 호출한다.
 *
 * @param supabase service_role 클라이언트 (RLS 우회, 쓰기 가능)
 * @param overrides 매칭 파라미터 일부 덮어쓰기 (선택)
 */
export async function runMatching(
  supabase: SupabaseClient,
  overrides: Partial<MatchOptions> = {},
): Promise<MatchRunSummary> {
  const options: MatchOptions = { ...DEFAULT_MATCH_OPTIONS, ...overrides };

  const articles = await fetchNewArticles(supabase, options);

  const summary: MatchRunSummary = {
    processedArticles: articles.length,
    createdPairs: 0,
    belowThreshold: 0,
    skippedNoCandidate: 0,
    skippedDuplicateStory: 0,
  };

  // 재랭킹(구독 CLI) 실패 추적 — 실패한 기사는 스킵(가짜 점수 미생성)하고 계속한다.
  let codexFailures = 0;
  let codexAlertRecorded = false;
  // 재랭킹이 이번 실행에서 **한 번이라도 성공**했는지 — 성공 시 과거 실패 경고를
  // 자동 해소(self-heal)하기 위한 플래그. (후보가 아예 없던 실행은 판단 근거가 없다)
  let rerankSucceeded = false;

  for (const base of articles) {
    const found = await findCandidates(supabase, base, options);
    // 같은 story(제목이 같은 MBC 뉴스+유튜브)로 이미 페어가 있으면 후보에서 뺀다(#188)
    const { candidates, skipped } = await filterStoryDuplicates(supabase, base, found);
    summary.skippedDuplicateStory += skipped;

    if (candidates.length === 0) {
      summary.skippedNoCandidate += 1;
      continue;
    }

    let built: { results: MatchResult[]; belowThreshold: number };
    try {
      built = await buildResultsForArticle(base, candidates, options);
    } catch (e) {
      // ⚠️ 사용자 방침: 재랭킹(구독 CLI) 실패 시 목업 점수로 후보를 만들지 않는다.
      //    해당 기사만 스킵(가짜 점수 미생성)하고 계속 처리해 완주한다.
      //    첫 실패에 관리자 경고(system_alerts) 1회를 남긴다.
      codexFailures += 1;
      if (!codexAlertRecorded) {
        codexAlertRecorded = true;
        await recordAlert(
          supabase,
          "ai_rerank_failed",
          `크로스뷰 재랭킹(구독 CLI, codex)이 실패해 일부 기사를 건너뜁니다. ` +
            `목업/로컬 점수로 후보를 만들지 않았습니다. 첫 원인: ${(e as Error).message}`,
          { severity: "warning", context: { firstFailedArticleId: base.id } },
        );
      }
      continue;
    }

    rerankSucceeded = true;
    summary.belowThreshold += built.belowThreshold;

    const created = await persistPairs(supabase, built.results);
    summary.createdPairs += created;
  }

  // self-heal: 재랭킹이 한 번이라도 성공했고 이번 실행에 실패가 하나도 없으면,
  // 과거에 남은 미해결 ai_rerank_failed 경고를 자동 해소한다(수동 해소 UI 부재 보완).
  if (rerankSucceeded && codexFailures === 0) {
    await resolveAlerts(supabase, "ai_rerank_failed");
  }

  return summary;
}
