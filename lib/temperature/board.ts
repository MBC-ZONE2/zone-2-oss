// ============================================================================
// lib/temperature/board — 온도계 읽기 쿼리 (공개 API 용)
//
// GET /api/temperature        → 최신 배치 TOP5 + 최신 보드 (TemperatureBoard)
// GET /api/temperature/[id]   → 이슈 온도 추이 (TemperaturePoint[])
//
// 공개 읽기는 anon 클라이언트 + RLS 로 노출 범위가 제한된다(docs/04).
// DB snake_case → 앱 camelCase 매핑은 여기서 수행한다.
// ============================================================================

import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { linkArticles, loadArticlePool, matchesAnyKeyword } from "./link";
import type {
  Issue,
  Sentiment,
  TemperatureBoard,
  TemperatureBoardItem,
  TemperaturePoint,
} from "@/types";

/** TOP N 기본값 (docs: TOP5) */
export const TOP_N = 5;

/** 보드 조회 상한 (limit 옵션 안전 클램프용) */
const BOARD_MAX_LIMIT = 50;

/** 추이 조회 기본 포인트 수 (15분 × 96 = 24시간) */
const TREND_DEFAULT_LIMIT = 96;
/** 추이 조회 상한 — 7일 잔상(96×7=672)을 덮되 PostgREST max_rows(1000) 아래로 */
const TREND_MAX_LIMIT = 800;

/** 감정 분포 매칭 윈도 — compute.ts loadIssueInputs 와 동일(최근 7일) */
const SENTIMENT_LOOKBACK_DAYS = 7;
/** 이슈 ↔ 기사 연결에 쓰는 기사 창 — compute.ts ISSUE_SEED_DAYS 와 같게 */
const ARTICLE_LINK_DAYS = 30;
/** 감정 집계 시 로드할 댓글 상한 (compute.ts MAX_COMMENTS 와 정렬) */
const SENTIMENT_MAX_COMMENTS = 5000;

/** 이슈 감정 분포 (긍정/중립/부정 댓글 수) — GET /api/temperature/[issueId] */
export interface SentimentDist {
  pos: number;
  neu: number;
  neg: number;
}

/** GET /api/temperature/[issueId] 응답 — 추이 + 감정 분포 */
export interface IssueTrendResponse {
  trend: TemperaturePoint[];
  sentimentDist: SentimentDist;
}

// DB row 형태 (snake_case)
interface ScoreRow {
  id: string;
  issue_id: string | null;
  temperature: number;
  frequency: number | null;
  sentiment_var: number | null;
  topic_conc: number | null;
  rank: number | null;
  prev_rank: number | null;
  computed_at: string;
}

interface IssueRow {
  id: string;
  label: string;
  keywords: string[] | null;
  created_at: string;
}

/**
 * 최신 배치의 상위 온도 보드를 반환한다. 데이터가 없으면 빈 보드.
 * @param limit 반환할 상위 항목 수(기본 TOP_N=5, 1~50 클램프). 기존 호출은
 *   인자 없이 호출하므로 무영향이다. 홈 기상도 밴드만 limit=8 로 확장한다.
 */
export async function getTemperatureBoard(
  limit: number = TOP_N,
): Promise<TemperatureBoard> {
  const safeLimit = Math.min(
    Math.max(1, Math.floor(Number.isFinite(limit) ? limit : TOP_N)),
    BOARD_MAX_LIMIT,
  );
  const supabase = await createClient();

  // 1) 가장 최근 산출 시각 1건
  const { data: latest, error: latestError } = await supabase
    .from("temperature_scores")
    .select("computed_at")
    .order("computed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestError) {
    throw new Error(`최신 산출 시각 조회 실패: ${latestError.message}`);
  }
  if (!latest) {
    return { items: [], computedAt: new Date(0).toISOString() };
  }
  const computedAt = (latest as { computed_at: string }).computed_at;

  // 2) 해당 배치의 점수 (rank 오름차순 TOP N)
  const { data: scoreData, error: scoreError } = await supabase
    .from("temperature_scores")
    .select(
      "id, issue_id, temperature, frequency, sentiment_var, topic_conc, rank, prev_rank, computed_at",
    )
    .eq("computed_at", computedAt)
    .order("rank", { ascending: true })
    .limit(safeLimit);
  if (scoreError) {
    throw new Error(`온도 점수 조회 실패: ${scoreError.message}`);
  }
  const scores = (scoreData ?? []) as ScoreRow[];
  if (scores.length === 0) {
    return { items: [], computedAt };
  }

  // 3) 연결 이슈 일괄 조회 → 맵
  const issueIds = scores
    .map((s) => s.issue_id)
    .filter((id): id is string => id != null);
  const issueMap = await loadIssues(supabase, issueIds);

  const items: TemperatureBoardItem[] = scores.map((s) => ({
    ...toBoardItemBase(s),
    issue: s.issue_id ? (issueMap.get(s.issue_id) ?? null) : null,
  }));

  return { items, computedAt };
}

/**
 * 이슈 1건의 온도 추이를 시간 오름차순으로 반환한다.
 * @param limit 최근 N 포인트 (기본 96, 최대 800 — 7일 잔상 672 포함)
 */
export async function getIssueTrend(
  issueId: string,
  limit = TREND_DEFAULT_LIMIT,
): Promise<TemperaturePoint[]> {
  if (!issueId) return [];
  const safeLimit = Math.min(Math.max(1, Math.floor(limit)), TREND_MAX_LIMIT);

  const supabase = await createClient();
  // 최근 N 개를 내림차순으로 가져온 뒤 오름차순으로 뒤집어 반환 (차트는 시간순)
  const { data, error } = await supabase
    .from("temperature_scores")
    .select("temperature, computed_at")
    .eq("issue_id", issueId)
    .order("computed_at", { ascending: false })
    .limit(safeLimit);
  if (error) {
    throw new Error(`온도 추이 조회 실패: ${error.message}`);
  }

  const rows = (data ?? []) as { temperature: number; computed_at: string }[];
  return rows
    .map((r) => ({ temperature: r.temperature, computedAt: r.computed_at }))
    .reverse();
}

/** 이슈 1건을 id 로 조회한다(없으면 null). 상세 페이지 notFound 판별용. */
export async function getIssueById(issueId: string): Promise<Issue | null> {
  if (!issueId) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("issues")
    .select("id, label, keywords, created_at")
    .eq("id", issueId)
    .maybeSingle();
  if (error) {
    throw new Error(`이슈 조회 실패: ${error.message}`);
  }
  if (!data) return null;
  const row = data as IssueRow;
  return {
    id: row.id,
    label: row.label,
    keywords: row.keywords,
    createdAt: row.created_at,
  };
}

/**
 * 이슈에 연결된 최근 7일 댓글의 감정 분포를 집계한다.
 * 연결 기준은 compute.ts loadIssueInputs 와 동일(#183): 키워드 → 지역 기사 → 그 기사의 댓글,
 * 또는 본문 키워드 매칭(lib/temperature/link). 미분류(sentiment=null)는 제외 — 산출 크론이
 * 분류 결과를 comments.sentiment 에 저장하므로 다음 실행부터 값이 찬다. 키워드가 없으면 0 분포.
 */
export async function getIssueSentimentDist(
  issueId: string,
): Promise<SentimentDist> {
  const empty: SentimentDist = { pos: 0, neu: 0, neg: 0 };
  if (!issueId) return empty;
  const supabase = await createClient();

  const { data: issueRow, error: issueError } = await supabase
    .from("issues")
    .select("keywords")
    .eq("id", issueId)
    .maybeSingle();
  if (issueError) {
    throw new Error(`이슈 키워드 조회 실패: ${issueError.message}`);
  }
  const keywords = (((issueRow?.keywords as string[] | null) ?? []) as string[]).filter(Boolean);
  if (keywords.length === 0) return empty;

  const now = new Date();
  const since = new Date(now.getTime() - SENTIMENT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const [pool, rows] = await Promise.all([
    loadArticlePool(supabase, now, ARTICLE_LINK_DAYS),
    // PostgREST max_rows(1000) 절단 우회 — compute.ts 와 동일 패턴.
    fetchAllRows<{ article_id: string | null; body: string; sentiment: Sentiment | null }>(
      (from, to) =>
        supabase
          .from("comments")
          .select("article_id, body, sentiment")
          .gte("published_at", since.toISOString())
          .order("published_at", { ascending: false })
          .range(from, to),
      { max: SENTIMENT_MAX_COMMENTS, label: "댓글" },
    ),
  ]);
  return tallySentiment(rows, keywords, linkArticles(keywords, pool));
}

/** 연결된 댓글의 감정을 pos/neu/neg 로 집계한다(순수). */
function tallySentiment(
  rows: { article_id: string | null; body: string; sentiment: Sentiment | null }[],
  keywords: string[],
  linked: Set<string>,
): SentimentDist {
  const dist: SentimentDist = { pos: 0, neu: 0, neg: 0 };
  for (const c of rows) {
    if (!((c.article_id && linked.has(c.article_id)) || matchesAnyKeyword(c.body, keywords))) continue;
    if (c.sentiment === "pos") dist.pos += 1;
    else if (c.sentiment === "neg") dist.neg += 1;
    else if (c.sentiment === "neu") dist.neu += 1;
  }
  return dist;
}

/** issueId 목록 → Issue 맵 (camelCase) */
async function loadIssues(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ids: string[],
): Promise<Map<string, Issue>> {
  const map = new Map<string, Issue>();
  if (ids.length === 0) return map;

  const { data, error } = await supabase
    .from("issues")
    .select("id, label, keywords, created_at")
    .in("id", ids);
  if (error) {
    throw new Error(`이슈 조회 실패: ${error.message}`);
  }

  for (const row of (data ?? []) as IssueRow[]) {
    map.set(row.id, {
      id: row.id,
      label: row.label,
      keywords: row.keywords,
      createdAt: row.created_at,
    });
  }
  return map;
}

/** ScoreRow → TemperatureBoardItem 의 TemperatureScore 부분 (issue 제외) */
function toBoardItemBase(s: ScoreRow): Omit<TemperatureBoardItem, "issue"> {
  return {
    id: s.id,
    issueId: s.issue_id,
    temperature: s.temperature,
    frequency: s.frequency,
    sentimentVar: s.sentiment_var,
    topicConc: s.topic_conc,
    rank: s.rank,
    prevRank: s.prev_rank,
    computedAt: s.computed_at,
  };
}
