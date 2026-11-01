// ============================================================================
// lib/ingest/ingest — 수집 파이프라인 오케스트레이션
//
// docs/06 §5 /cron/ingest, docs/07 Phase 1:
//   어댑터 순회 → fetchArticles/fetchComments → 정규화 → 임베딩(lib/ai)
//   → articles/comments upsert(중복: source+external_id) → 멱등.
//
// - 외부 API 실제 호출은 하지 않는다(어댑터·lib/ai 위임). 키 없이 DemoAdapter
//   로 동작해야 하므로, 임베딩 실패/어댑터 에러는 격리하여 적재를 계속한다.
// - DB 접근은 lib/supabase 의 service_role 클라이언트만 사용한다.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/server";
import { adapters as defaultAdapters } from "@/lib/adapters/registry";
import type { MediaSourceAdapter } from "@/lib/adapters/types";
import { embedArticles } from "./embed-articles";
import {
  normalizeArticle,
  normalizeComment,
  resolveSource,
  type ArticleRow,
  type CommentRow,
} from "./normalize";

/** 기본 수집 윈도우: 최근 N일 (since 미지정 시) */
const DEFAULT_LOOKBACK_DAYS = 30;

/** 단일 어댑터 수집 결과 요약 */
export interface AdapterIngestResult {
  adapterId: string;
  source: string;
  articlesFetched: number;
  articlesUpserted: number;
  commentsFetched: number;
  commentsUpserted: number;
  embedded: boolean;
  /** 비치명적 경고(임베딩 실패 등) */
  warnings: string[];
  /** 치명적 에러(이 어댑터만 스킵, 전체는 계속) */
  error?: string;
}

/** 전체 수집 실행 결과 */
export interface IngestResult {
  ok: boolean;
  startedAt: string;
  finishedAt: string;
  since: string;
  totalArticlesUpserted: number;
  totalCommentsUpserted: number;
  adapters: AdapterIngestResult[];
}

export interface RunIngestOptions {
  /** 이 시각 이후 기사만 수집 (기본: 최근 30일) */
  since?: Date;
  /** 어댑터 목록 주입 (기본: registry) — 테스트/부분수집용 */
  adapters?: MediaSourceAdapter[];
  /** Supabase 클라이언트 주입 (기본: service_role) — 테스트용 */
  client?: ReturnType<typeof createServiceClient>;
}

/**
 * 수집 파이프라인 메인 엔트리.
 * 모든 활성 어댑터를 순회하며 기사/댓글을 적재한다. 멱등(중복 upsert 안전).
 */
export async function runIngest(
  options: RunIngestOptions = {},
): Promise<IngestResult> {
  const startedAt = new Date();
  const since =
    options.since ??
    new Date(startedAt.getTime() - DEFAULT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  const adapters = options.adapters ?? defaultAdapters;
  const supabase = options.client ?? createServiceClient();

  const results: AdapterIngestResult[] = [];

  for (const adapter of adapters) {
    // 어댑터별 증분 창(高水位). since 를 명시했거나 처음 수집이면 기본 창을 쓴다.
    const adapterSince = options.since
      ? since
      : await resolveIncrementalSince(supabase, adapter, since);
    results.push(await ingestAdapter(adapter, adapterSince, supabase));
  }

  const finishedAt = new Date();
  const totalArticlesUpserted = results.reduce(
    (sum, r) => sum + r.articlesUpserted,
    0,
  );
  const totalCommentsUpserted = results.reduce(
    (sum, r) => sum + r.commentsUpserted,
    0,
  );

  const result: IngestResult = {
    // 어댑터 치명 에러가 하나도 없으면 ok
    ok: results.every((r) => !r.error),
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    since: since.toISOString(),
    totalArticlesUpserted,
    totalCommentsUpserted,
    adapters: results,
  };

  // 실행 로그 기록 — 검증지표 #1(API 수집 성공률 ≥ 95%)의 측정 근거.
  // 기록 실패가 수집 결과를 깨뜨려선 안 된다(온도 크론과 같은 방침).
  await recordIngestRun(supabase, result).catch((error) => {
    console.error("ingest_runs 기록 실패:", errMsg(error));
  });

  return result;
}

/**
 * 수집 실행 1회를 `ingest_runs` 에 남긴다.
 *
 * 성공률 분모는 **어댑터 호출 수**다 — 실행 단위로 세면 3종 중 1종만 실패해도
 * 그 실행이 통째로 실패로 잡혀 지표가 왜곡된다(docs/02 "API 수집 성공률").
 */
async function recordIngestRun(
  supabase: SupabaseClient,
  result: IngestResult,
): Promise<void> {
  const failed = result.adapters.filter((a) => a.error);
  const detail =
    failed.length > 0
      ? failed.map((a) => `${a.adapterId}: ${a.error}`).join(" / ")
      : `어댑터 ${result.adapters.length}종 정상 — 기사 ${result.totalArticlesUpserted}건, 댓글 ${result.totalCommentsUpserted}건`;

  const { error } = await supabase.from("ingest_runs").insert({
    status: result.ok ? "ok" : "fail",
    detail: detail.slice(0, 1000),
    adapters_total: result.adapters.length,
    adapters_failed: failed.length,
    articles_upserted: result.totalArticlesUpserted,
    comments_upserted: result.totalCommentsUpserted,
  });
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// 증분 수집 창 (high-water mark)
// ---------------------------------------------------------------------------

/**
 * 이미 적재한 것보다 뒤만 다시 훑도록 since 를 끌어올린다.
 *
 * 왜 필요한가: 어댑터는 1회 수집량에 상한이 있다(유튜브 200건·옥천 50건).
 * 매번 30일 창을 최신순으로 훑으면 상한을 넘는 구간이 영영 들어오지 않고,
 * 매 실행이 같은 최신분을 재적재하면서 매칭 대상만 부풀린다.
 * 적재된 최신 발행일을 기준으로 삼으면 창이 자연히 앞으로 전진한다.
 *
 * 겹침(OVERLAP)을 두는 이유: 발행일이 소급 수정되거나 지연 노출된 항목을
 * 놓치지 않기 위함이다.
 *
 * ⚠️ 데모 기사는 제외해야 한다. 데모는 발행일을 항상 "몇 시간 전"으로 만들고
 *    실수집분과 같은 source 로 적재된다. 포함하면 커서가 항상 현재로 끌려가
 *    실제 기사(예: 주간지 옥천신문의 3일 전 발행분)가 영구히 건너뛰어진다.
 */
const HIGH_WATER_OVERLAP_MS = 24 * 60 * 60 * 1000;

/** 데모 어댑터가 쓰는 external_id 접두사 (lib/adapters/demo.ts 규칙) */
const DEMO_ID_PREFIX = "demo-";

async function resolveIncrementalSince(
  supabase: ReturnType<typeof createServiceClient>,
  adapter: MediaSourceAdapter,
  fallback: Date,
): Promise<Date> {
  const source = resolveSource(adapter);

  const { data, error } = await supabase
    .from("articles")
    .select("published_at")
    .eq("source", source)
    .not("published_at", "is", null)
    // 데모 발행일이 커서를 현재로 끌어당기지 않도록 제외한다.
    .not("external_id", "like", `${DEMO_ID_PREFIX}%`)
    .order("published_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // 조회 실패는 치명적이지 않다 — 기본 창으로 진행한다.
  if (error || !data) return fallback;

  const latest = Date.parse((data as { published_at: string }).published_at);
  if (Number.isNaN(latest)) return fallback;

  const incremental = new Date(latest - HIGH_WATER_OVERLAP_MS);
  // 기본 창보다 뒤로 물러나지는 않는다(최초 수집·장기 정지 후 복귀 대비).
  return incremental > fallback ? incremental : fallback;
}

// ---------------------------------------------------------------------------
// 어댑터 단위 수집
// ---------------------------------------------------------------------------

async function ingestAdapter(
  adapter: MediaSourceAdapter,
  since: Date,
  supabase: ReturnType<typeof createServiceClient>,
): Promise<AdapterIngestResult> {
  const source = resolveSource(adapter);
  const warnings: string[] = [];
  const base: AdapterIngestResult = {
    adapterId: adapter.id,
    source,
    articlesFetched: 0,
    articlesUpserted: 0,
    commentsFetched: 0,
    commentsUpserted: 0,
    embedded: false,
    warnings,
  };

  // 1) 기사 수집 + 정규화
  let rawArticles;
  try {
    rawArticles = await adapter.fetchArticles(since);
  } catch (error) {
    return { ...base, error: `fetchArticles 실패: ${errMsg(error)}` };
  }
  base.articlesFetched = rawArticles.length;

  if (rawArticles.length === 0) {
    return base; // 적재할 기사 없음 — 정상 종료
  }

  const articleRows: ArticleRow[] = rawArticles.map((a) =>
    normalizeArticle(a, source),
  );

  // 2) 임베딩 (실패해도 적재 계속)
  const embedResult = await embedArticles(articleRows);
  base.embedded = embedResult.embedded;
  if (embedResult.error) {
    warnings.push(`임베딩 생략: ${embedResult.error}`);
  }

  // 3) articles upsert (중복: source+external_id) → id 회수
  let externalIdToId: Map<string, string>;
  try {
    externalIdToId = await upsertArticles(supabase, embedResult.rows);
    base.articlesUpserted = externalIdToId.size;
  } catch (error) {
    return { ...base, error: `articles upsert 실패: ${errMsg(error)}` };
  }

  // 4) 댓글 수집: 기사별 fetchComments → 정규화(article_id 연결)
  const commentRows: CommentRow[] = [];
  for (const article of rawArticles) {
    let rawComments;
    try {
      rawComments = await adapter.fetchComments(article.externalId);
    } catch (error) {
      warnings.push(
        `fetchComments(${article.externalId}) 실패: ${errMsg(error)}`,
      );
      continue; // 이 기사 댓글만 스킵
    }
    base.commentsFetched += rawComments.length;

    const articleId = externalIdToId.get(article.externalId) ?? null;
    for (const c of rawComments) {
      commentRows.push({ ...normalizeComment(c, source), article_id: articleId });
    }
  }

  // 5) comments upsert (중복: source+external_id)
  if (commentRows.length > 0) {
    try {
      base.commentsUpserted = await upsertComments(supabase, commentRows);
    } catch (error) {
      warnings.push(`comments upsert 실패: ${errMsg(error)}`);
    }
  }

  return base;
}

// ---------------------------------------------------------------------------
// DB upsert 헬퍼
// ---------------------------------------------------------------------------

/**
 * articles 멱등 upsert. external_id → id 매핑을 반환한다.
 * onConflict: 'source,external_id' (docs/04 unique 제약).
 */
async function upsertArticles(
  supabase: ReturnType<typeof createServiceClient>,
  rows: ArticleRow[],
): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from("articles")
    .upsert(rows, { onConflict: "source,external_id" })
    .select("id, external_id");

  if (error) throw new Error(error.message);

  const map = new Map<string, string>();
  for (const row of (data ?? []) as Array<{
    id: string;
    external_id: string | null;
  }>) {
    if (row.external_id) map.set(row.external_id, row.id);
  }
  return map;
}

/**
 * comments 멱등 upsert. 적재(반환)된 행 수를 돌려준다.
 * onConflict: 'source,external_id' (docs/04 unique 제약).
 */
async function upsertComments(
  supabase: ReturnType<typeof createServiceClient>,
  rows: CommentRow[],
): Promise<number> {
  const { data, error } = await supabase
    .from("comments")
    .upsert(rows, { onConflict: "source,external_id" })
    .select("id");

  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown[]).length;
}

function errMsg(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
