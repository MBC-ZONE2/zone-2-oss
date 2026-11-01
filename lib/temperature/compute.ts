// ============================================================================
// lib/temperature/compute — 온도 산출 1회 실행 (DB I/O)
//
// docs/04: comments 감정 + Postgres 집계 → temperature_scores + temperature_runs
// docs/06 §5: /cron/temperature (15분 주기 가정)
//
// 1) issues + 연결 댓글 로드
// 2) scoring 파이프라인(정규화·온도·랭킹)
// 3) temperature_scores 일괄 insert
// 4) temperature_runs 에 성공/실패 기록 (작동률 검증용)
//
// service_role 클라이언트(RLS 우회)로 동작한다. Cron/서버 전용.
// ============================================================================

import { createServiceClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { recordAlertOnce, resolveAlerts } from "@/lib/alerts";
import { ensureIssuesFromArticles } from "./issues";
import { linkArticles, loadArticlePool, matchesAnyKeyword } from "./link";
import {
  fillSentiments,
  rankAndBuildRows,
  rawComponentsFor,
  scoreIssues,
} from "./scoring";
import type { ComputeRunResult, IssueComment, IssueInput, RunStats } from "./types";

/** 감정 분류 경로 이상(로컬 모델 실패·mock 폴백·순번 누락) 경보 kind — #181 결함 A */
const SENTIMENT_ALERT_KIND = "sentiment_fallback";

/** 댓글을 이슈 키워드와 매칭하기 위해 최근 며칠 치를 볼지 (decay 와 별개의 로드 윈도) */
const LOOKBACK_DAYS = 7;

/**
 * 공론장(공식 여론) 글의 로드 윈도. 뉴스 댓글보다 **길게** 잡는다(#110-B).
 * 공론장 여론은 고빈도 뉴스 댓글과 달리 희소하고 느리게 쌓이며, 한 이슈에 대한
 * "선 여론"이 며칠~몇 주에 걸쳐 남는다. 7일로 자르면 이슈당 여론이 ≤1건이 되어
 * β(감정분산)가 죽는다. 이슈 수명(ISSUE_SEED_DAYS=30)에 맞춰 30일을 본다.
 */
const FORUM_LOOKBACK_DAYS = 30;

/** 이슈 생성용 기사 윈도 (ingest 윈도와 정렬) — 보드에 이슈가 항상 존재하도록 넉넉히 */
const ISSUE_SEED_DAYS = 30;

/** 한 번에 로드할 댓글 상한 (메모리·성능 보호) */
const MAX_COMMENTS = 5000;

/**
 * 온도 산출 1회를 실행하고 결과를 DB 에 반영한다.
 * 실패해도 throw 하지 않고 temperature_runs 에 fail 을 남긴 뒤 결과를 반환한다
 * (Cron 작동률 모니터링을 위해 항상 실행 기록을 남긴다).
 */
export async function runTemperatureComputation(): Promise<ComputeRunResult> {
  const supabase = createServiceClient();
  const computedAt = new Date();
  const computedAtIso = computedAt.toISOString();

  try {
    // 0) 이슈 생성(키워드 그룹핑) — issues 가 비어 있으면 최근 기사로 채운다(멱등).
    //    이 경로가 없으면 항상 "산출 대상 이슈 없음" 으로 끝났다.
    await ensureIssuesFromArticles(supabase, computedAt, ISSUE_SEED_DAYS);

    const { issues, linkedArticles, pool } = await loadIssueInputs(supabase, computedAt);

    if (issues.length === 0) {
      const detail = "산출 대상 이슈 없음";
      await recordRun(supabase, "ok", detail);
      return { status: "ok", detail, issueCount: 0, computedAt: computedAtIso };
    }

    // 1) 감정 분류 채우기 → 2) raw 성분 → 3) 정규화·온도
    const { issues: withSentiment, stats: fill } = await fillSentiments(issues);
    // 분류 결과를 comments.sentiment 에 되써 넣는다(#183) — 다음 실행부터 재분류하지 않고,
    // 공개 감정 분포(board.getIssueSentimentDist)와 분류율 측정이 DB 값으로 가능해진다.
    const persisted = await persistSentiments(supabase, issues, withSentiment);
    const raws = withSentiment.map((issue) =>
      rawComponentsFor(issue, computedAt),
    );
    const scored = scoreIssues(raws);

    // 입력 통계 — "감정 성분 0" 이 분류 실패인지 매칭 0건인지 구분하는 근거(temperature_runs.stats)
    const stats: RunStats = {
      ...fill,
      issues: issues.length,
      matched: issues.reduce((n, i) => n + i.comments.length, 0),
      issuesWithOpinions: issues.filter((i) => i.comments.length > 0).length,
      linkedArticles,
      pool,
      persisted,
    };
    await reportSentimentHealth(supabase, stats, computedAtIso);

    // 4) 직전 순위 로드 → rank/prevRank 부여
    const prevRanks = await loadPreviousRanks(supabase);
    const rows = rankAndBuildRows(scored, prevRanks, computedAtIso);

    // 5) 일괄 저장
    const { error: insertError } = await supabase
      .from("temperature_scores")
      .insert(rows);
    if (insertError) {
      throw new Error(`temperature_scores insert 실패: ${insertError.message}`);
    }

    const detail =
      `이슈 ${rows.length}건 산출 · 여론 매칭 ${stats.matched}건(사안 ${stats.issuesWithOpinions}개, 풀 ${stats.pool}·연결 기사 ${stats.linkedArticles})` +
      (stats.pending > 0
        ? ` · 감정 분류 ${stats.classified}/${stats.pending}(${stats.provider ?? "-"})`
        : " · 감정 분류 대상 없음");
    await recordRun(supabase, "ok", detail, stats);
    return {
      status: "ok",
      detail,
      issueCount: rows.length,
      computedAt: computedAtIso,
      stats,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("온도 산출 실패:", message);
    // 실패도 반드시 기록 (작동률 지표)
    await recordRun(supabase, "fail", message).catch((e) => {
      console.error("temperature_runs 기록마저 실패:", e);
    });
    return {
      status: "fail",
      detail: message,
      issueCount: 0,
      computedAt: computedAtIso,
    };
  }
}

type ServiceClient = ReturnType<typeof createServiceClient>;

/**
 * issues + 여론(LOOKBACK_DAYS 내 댓글 + 공론장 글)을 연결해 IssueInput[] 으로 만든다.
 * 연결 규칙(#183, lib/temperature/link):
 *   ① 이슈 키워드 → 지역 기사(30일, 비공고, 전국 클립 제외) → 그 기사의 댓글(article_id)
 *   ② 여론 본문에 키워드 직접 매칭(여러 낱말 키워드는 낱말 전부 포함이면 참)
 * 댓글 풀 자체도 지역 기사의 것만 쓴다 — 지역 공론 온도계에 전국 정치 클립 댓글은 입력이 아니다.
 */
async function loadIssueInputs(
  supabase: ServiceClient,
  now: Date,
): Promise<{ issues: IssueInput[]; linkedArticles: number; pool: number }> {
  // 이슈 목록
  const { data: issuesData, error: issuesError } = await supabase
    .from("issues")
    .select("id, keywords");
  if (issuesError) {
    throw new Error(`issues 로드 실패: ${issuesError.message}`);
  }
  const issues = (issuesData ?? []) as { id: string; keywords: string[] | null }[];
  if (issues.length === 0) return { issues: [], linkedArticles: 0, pool: 0 };

  // 기사 풀(이슈 수명과 같은 30일) — 지역성 판정 포함
  const articles = await loadArticlePool(supabase, now, ISSUE_SEED_DAYS);
  const regionalIds = new Set(articles.filter((a) => a.regional).map((a) => a.id));
  const knownIds = new Set(articles.map((a) => a.id));

  // 최근 댓글 로드 (감정 포함, 시간 윈도 제한)
  const since = new Date(now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  // PostgREST max_rows(1000) 절단을 피해 .range() 페이지로 MAX_COMMENTS 까지 실제로 받는다
  // (2026-09-03 전량 0도 사고의 원인 — lib/supabase/fetch-all.ts 참고).
  const commentsAll = await fetchAllRows<{
    id: string;
    article_id: string | null;
    body: string;
    sentiment: IssueComment["sentiment"];
    published_at: string | null;
  }>(
    (from, to) =>
      supabase
        .from("comments")
        .select("id, article_id, body, sentiment, published_at")
        .gte("published_at", since.toISOString())
        .order("published_at", { ascending: false })
        .range(from, to),
    { max: MAX_COMMENTS, label: "comments" },
  );
  // 전국 클립(비지역) 기사의 댓글은 뺀다. 기사를 모르는 댓글(풀 밖 오래된 기사·null)은 키워드 경로만 탄다.
  const comments = commentsAll.filter(
    (c) => !c.article_id || !knownIds.has(c.article_id) || regionalIds.has(c.article_id),
  );

  // 공론장(공식 여론) 글도 β(감정분산) 입력에 포함한다(#110-B). 뉴스 댓글은
  // 하이퍼로컬 이슈와 겹치는 게 거의 없어(이슈당 ≤1건) β 가 죽어 있었다. 공론장은
  // 주민이 이슈에 직접 남긴 여론이라 정렬이 좋다. 숨김(is_flagged) 글은 제외하고,
  // 이슈 수명(FORUM_LOOKBACK_DAYS)만큼 본다.
  const forumSince = new Date(
    now.getTime() - FORUM_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
  );
  const forumData = await fetchAllRows<{
    title: string | null;
    body: string | null;
    created_at: string | null;
  }>(
    (from, to) =>
      supabase
        .from("forum_posts")
        .select("title, body, created_at")
        .eq("is_flagged", false)
        .gte("created_at", forumSince.toISOString())
        .order("created_at", { ascending: false })
        .range(from, to),
    { max: MAX_COMMENTS, label: "forum_posts" },
  );
  // 절단·윈도 문제를 서버 로그에서 바로 볼 수 있게 로드 행수를 남긴다.
  console.log(
    "[temperature] articles=%d(regional %d) comments=%d(regional pool %d) forum=%d since=%s",
    articles.length,
    regionalIds.size,
    commentsAll.length,
    comments.length,
    forumData.length,
    since.toISOString(),
  );
  // 공론장 글을 IssueComment 형태로 정규화(제목+본문을 여론 텍스트로).
  const forumOpinions = forumData.map((p) => ({
    id: null as string | null,
    article_id: null as string | null,
    body: `${p.title ?? ""} ${p.body ?? ""}`.trim(),
    sentiment: null as IssueComment["sentiment"],
    published_at: p.created_at,
  }));

  // 뉴스 댓글 + 공론장 여론을 한 풀로.
  const opinions = [...comments, ...forumOpinions];

  let linkedArticles = 0;
  const out = issues.map((issue) => {
    const keywords = (issue.keywords ?? []).filter(Boolean);
    const linked = linkArticles(keywords, articles);
    linkedArticles += linked.size;
    const matched: IssueComment[] = opinions
      .filter((c) => (c.article_id != null && linked.has(c.article_id)) || matchesAnyKeyword(c.body, keywords))
      .map((c) => ({
        id: c.id,
        body: c.body,
        publishedAt: c.published_at,
        sentiment: c.sentiment,
      }));

    return { issueId: issue.id, keywords, comments: matched };
  });
  return { issues: out, linkedArticles, pool: opinions.length };
}

/**
 * fillSentiments 가 새로 채운 라벨을 comments.sentiment 에 되써 넣는다(#183).
 * 전후 IssueInput 을 같은 순서로 비교해 (id, label) 을 모으고 라벨별 한 번씩 update 한다.
 * 실패해도 산출을 깨지 않는다(로그만). @returns 갱신 요청한 댓글 수
 */
async function persistSentiments(
  supabase: ServiceClient,
  before: IssueInput[],
  after: IssueInput[],
): Promise<number> {
  const byLabel = new Map<string, Set<string>>();
  before.forEach((issue, i) => {
    issue.comments.forEach((c, j) => {
      const filled = after[i]?.comments[j]?.sentiment;
      if (!c.id || c.sentiment != null || !filled) return;
      (byLabel.get(filled) ?? byLabel.set(filled, new Set()).get(filled)!).add(c.id);
    });
  });
  let n = 0;
  for (const [label, ids] of byLabel) {
    const list = [...ids];
    for (let i = 0; i < list.length; i += 200) {
      const chunk = list.slice(i, i + 200);
      const { error } = await supabase.from("comments").update({ sentiment: label }).in("id", chunk).is("sentiment", null);
      if (error) {
        console.error("[temperature] 감정 저장 실패:", error.message);
        continue;
      }
      n += chunk.length;
    }
  }
  return n;
}

/** 가장 최근 산출 배치의 issueId→rank 맵 (변동 화살표용) */
async function loadPreviousRanks(
  supabase: ServiceClient,
): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from("temperature_scores")
    .select("issue_id, rank, computed_at")
    .order("computed_at", { ascending: false })
    .limit(200);
  if (error) {
    // 직전 순위는 부가 정보 — 실패해도 산출은 계속한다.
    console.error("직전 순위 로드 실패(무시):", error.message);
    return new Map();
  }

  const rows = (data ?? []) as {
    issue_id: string | null;
    rank: number | null;
    computed_at: string;
  }[];
  if (rows.length === 0) return new Map();

  // 가장 최근 computed_at 배치만 추린다.
  const latestBatch = rows[0].computed_at;
  const map = new Map<string, number>();
  for (const row of rows) {
    if (row.computed_at !== latestBatch) break;
    if (row.issue_id != null && row.rank != null) {
      map.set(row.issue_id, row.rank);
    }
  }
  return map;
}

/**
 * 감정 분류 경로 이상을 system_alerts 에 남기거나(이상), 회복되면 걷는다(#181 결함 A).
 * 이상 = 로컬 모델이 켜져 있는데 실패 · mock 라벨로 산출 · 순번 누락으로 중립 메움.
 * 분류 대상이 0건이면 판단할 수 없으니 그대로 둔다. 같은 날 같은 사유는 한 번만 남긴다.
 */
async function reportSentimentHealth(
  supabase: ServiceClient,
  stats: RunStats,
  computedAtIso: string,
): Promise<void> {
  if (stats.pending === 0) return;
  const reasons: string[] = [];
  if (stats.localFailed) reasons.push("로컬 감정 모델 실패(LOCAL_SENTIMENT=1)");
  if (stats.provider === "mock") reasons.push("mock 라벨로 산출(실제 분류 아님)");
  if (stats.fallback > 0) reasons.push(`순번 누락 ${stats.fallback}건을 중립으로 메움`);
  if (reasons.length === 0) {
    await resolveAlerts(supabase, SENTIMENT_ALERT_KIND);
    return;
  }
  const day = computedAtIso.slice(0, 10);
  await recordAlertOnce(
    supabase,
    SENTIMENT_ALERT_KIND,
    `감정 분류 경로 이상 — ${reasons.join(" · ")}. 경로=${stats.provider ?? "-"}, 분류 ${stats.classified}/${stats.pending}건. 온도의 감정 성분이 실제와 다를 수 있습니다.`,
    {
      severity: stats.provider === "mock" || stats.localFailed ? "error" : "warning",
      context: { provider: stats.provider, pending: stats.pending, fallback: stats.fallback, localFailed: stats.localFailed },
      dedupeKey: `${day}:${stats.provider}:${stats.localFailed ? "lf" : ""}:${stats.fallback > 0 ? "fb" : ""}`,
    },
  );
}

/** temperature_runs 에 실행 결과를 기록한다 (작동률 ≥95% 검증용). stats 는 0022_metrics 의 jsonb. */
async function recordRun(
  supabase: ServiceClient,
  status: "ok" | "fail",
  detail: string,
  stats?: RunStats,
): Promise<void> {
  const row: { status: string; detail: string; stats?: RunStats } = { status, detail: detail.slice(0, 1000) };
  if (stats) row.stats = stats;
  const { error } = await supabase.from("temperature_runs").insert(row);
  if (error) {
    throw new Error(`temperature_runs insert 실패: ${error.message}`);
  }
}
