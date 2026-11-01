// ============================================================================
// lib/podcast/collect — 파이프라인 2~3단계: 데이터 수집 + Dedup
//
// 매체별로 몫을 나눠 기사 + 인기 댓글 TOP N 을 Supabase 에서 읽어온다(#166 옥천 몫 보장).
// service_role 클라이언트(RLS 우회)는 Cron/서버 컨텍스트에서만 사용한다.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { region } from "@/config/region";
import type { Article, Comment } from "@/types";
import type { CollectedSources, CollectOptions } from "./types";
import { isRegionalStory, NON_STORY_RE } from "./regional";

/** articles 테이블 row (필요 컬럼만) */
interface ArticleRow {
  id: string;
  source: Article["source"];
  kind: Article["kind"];
  external_id: string | null;
  url: string | null;
  title: string;
  body: string | null;
  category: string | null;
  keywords: string[] | null;
  published_at: string | null;
  raw: unknown;
  created_at: string;
}

/** comments 테이블 row (필요 컬럼만) */
interface CommentRow {
  id: string;
  source: Comment["source"];
  article_id: string | null;
  external_id: string | null;
  body: string;
  author_hash: string | null;
  like_count: number | null;
  sentiment: Comment["sentiment"];
  published_at: string | null;
  created_at: string;
}

function rowToArticle(row: ArticleRow): Article {
  return {
    id: row.id,
    source: row.source,
    kind: row.kind,
    externalId: row.external_id,
    url: row.url,
    title: row.title,
    body: row.body,
    category: row.category,
    keywords: row.keywords,
    publishedAt: row.published_at,
    // 임베딩은 스크립트 생성에 불필요 — 페이로드에서 제외한다.
    embedding: null,
    raw: row.raw,
    createdAt: row.created_at,
  };
}

function rowToComment(row: CommentRow): Comment {
  return {
    id: row.id,
    source: row.source,
    articleId: row.article_id,
    externalId: row.external_id,
    body: row.body,
    authorHash: row.author_hash,
    likeCount: row.like_count ?? 0,
    sentiment: row.sentiment,
    publishedAt: row.published_at,
    createdAt: row.created_at,
  };
}

const ARTICLE_COLUMNS =
  "id, source, kind, external_id, url, title, body, category, keywords, published_at, raw, created_at";
const COMMENT_COLUMNS =
  "id, source, article_id, external_id, body, author_hash, like_count, sentiment, published_at, created_at";

/** 기본값 — #166 권고: 옥천신문 7일/6건(주간지 보정), MBC충북 24h/14건 */
const DEFAULTS = { mbcHours: 24, mbcLimit: 14, okinewsDays: 7, okinewsLimit: 6, topComments: 10 };

function isoBefore(ms: number): string {
  return new Date(Date.now() - ms).toISOString();
}

function byPublishedDesc(a: Article, b: Article): number {
  return (b.publishedAt ?? b.createdAt).localeCompare(a.publishedAt ?? a.createdAt);
}

/**
 * 몫 채우기 — 직전 회차에 안 쓴 기사를 먼저, 모자라면 쓴 기사로 채운 뒤 **다시 최신순**으로 놓는다.
 * (새 기사를 우선하되, 코너 안 순서는 항상 최신이 앞이어야 한다 — 어제 사망 사고가 나흘 전 사진기사 뒤에 오면 안 된다)
 */
function fillQuota(fresh: Article[], used: Article[], limit: number): Article[] {
  return uniqueById(fresh, used).slice(0, limit).sort(byPublishedDesc);
}

/** 앞에서부터 중복 없이 합친다 */
function uniqueById(...lists: Article[][]): Article[] {
  const seen = new Set<string>();
  const out: Article[] = [];
  for (const list of lists) {
    for (const a of list) {
      if (seen.has(a.id)) continue;
      seen.add(a.id);
      out.push(a);
    }
  }
  return out;
}

/**
 * 최근 기사 + 인기 댓글을 수집한다 — **매체별로 몫을 나눠서**(#166).
 *
 * 예전엔 매체 구분 없이 최근 24h 최신 20건이라 평일엔 전부 MBC충북(유튜브 포함, 하루 수십 건)로 차고
 * 옥천신문(주간지, 목·금 집중)은 애초에 투입되지 않는 날이 대부분이었다(최근 30회차 옥천 0회차 19건).
 *
 * 순서: ③ 최근 7일 승인 크로스뷰 쌍의 양쪽 기사(광역×기초 대비 — 사업 취지) →
 *       ① 옥천신문 최근 7일 뉴스·여론광장 상위 N(직전 회차 투입분은 뒤로) →
 *       ① MBC충북 최근 24h(뉴스·유튜브) 상위 M.
 * 군청 공고(kind=notice)는 대본 재료에서 뺀다 — 옥천 소식이 없는 날 "오늘의 옥천" 코너에 마감 한 줄로만 쓴다.
 *
 * @param supabase service_role 클라이언트
 */
export async function collectSources(
  supabase: SupabaseClient,
  options: CollectOptions = {},
): Promise<CollectedSources> {
  const o = { ...DEFAULTS, ...options };
  const exclude = new Set(o.excludeIds ?? []);
  const H = 60 * 60 * 1000;

  // ③ 승인 크로스뷰 쌍(최근 7일) — 양쪽 기사를 맨 앞에, 쌍 순서(광역·기초)를 지켜서. 매칭이 드물어(주 0~2쌍) 보조 규칙이다.
  //    쌍이 오래된 기사나 공고·라이브를 가리키면 "오늘 소식"으로 소개될 수 없으니 양쪽 다 창(7일)·종류 검사를 통과할 때만 채택.
  const { data: pairRows, error: pairErr } = await supabase
    .from("crossview_pairs")
    .select("article_macro, article_micro")
    .eq("status", "approved")
    .gte("created_at", isoBefore(7 * 24 * H))
    .order("created_at", { ascending: false })
    .limit(2);
  if (pairErr) throw new Error(`크로스뷰 쌍 조회 실패: ${pairErr.message}`);
  const pairRefs = ((pairRows as { article_macro: string | null; article_micro: string | null }[] | null) ?? [])
    .filter((r): r is { article_macro: string; article_micro: string } => Boolean(r.article_macro && r.article_micro));
  const paired: Article[] = [];
  const pairs: CollectedSources["pairs"] = [];
  if (pairRefs.length > 0) {
    const ids = pairRefs.flatMap((r) => [r.article_macro, r.article_micro]);
    const { data, error } = await supabase.from("articles").select(ARTICLE_COLUMNS).in("id", ids);
    if (error) throw new Error(`크로스뷰 기사 조회 실패: ${error.message}`);
    const byId = new Map(((data as ArticleRow[] | null) ?? []).map(rowToArticle).map((a) => [a.id, a]));
    const freshSince = isoBefore(7 * 24 * H);
    const usable = (a: Article | undefined): a is Article =>
      Boolean(a) && (a!.kind === "news" || a!.kind === "youtube") && isRegionalStory(a!) &&
      (a!.publishedAt ?? a!.createdAt) >= freshSince;
    for (const r of pairRefs) {
      const macro = byId.get(r.article_macro);
      const micro = byId.get(r.article_micro);
      if (!usable(macro) || !usable(micro)) continue;
      paired.push(macro, micro);
      pairs.push({ macroId: macro.id, microId: micro.id });
    }
  }

  // ① 옥천신문 — 뉴스 우선, 여론광장(forum_opinion)으로 채움. 직전 회차 투입분은 뒤로(없으면 반복 허용).
  //    종류별로 따로 읽는다 — 한 쿼리로 읽으면 여론광장이 많은 날 뉴스가 상한 밖으로 밀려 아예 안 잡힌다.
  const okSince = isoBefore(o.okinewsDays * 24 * H);
  const readOk = async (kind: "news" | "forum_opinion"): Promise<Article[]> => {
    const { data, error } = await supabase
      .from("articles")
      .select(ARTICLE_COLUMNS)
      .eq("source", "okinews")
      .eq("kind", kind)
      .gte("published_at", okSince)
      .order("published_at", { ascending: false })
      .limit(o.okinewsLimit * 2);
    if (error) throw new Error(`${region.outlets.micro.name} ${kind} 수집 실패: ${error.message}`);
    return ((data as ArticleRow[] | null) ?? []).map(rowToArticle);
  };
  const [okNews, okOpinion] = await Promise.all([readOk("news"), readOk("forum_opinion")]);
  const okinews = fillQuota(
    uniqueById(okNews.filter((a) => !exclude.has(a.id)), okOpinion.filter((a) => !exclude.has(a.id))),
    uniqueById(okNews, okOpinion).filter((a) => exclude.has(a.id)),
    o.okinewsLimit,
  );

  // ① MBC충북 — 최근 창 안 뉴스·유튜브(공고·라이브·다시보기·전국 정치 클립 제외). 직전 투입분은 여기서도 뒤로
  // 라이브·다시보기는 쿼리에서 걸러 상한 안에 실제 기사만 들고, 전국 클립은 lib/podcast/regional 로 판정한다
  // (채널이 전국 정치 영상을 섞어 올려 72h 창에서 14건 중 절반이 그런 항목인 날이 있었다 — #166 후속)
  const { data: mbcRows, error: mbcErr } = await supabase
    .from("articles")
    .select(ARTICLE_COLUMNS)
    .eq("source", "mbc_cb")
    .in("kind", ["news", "youtube"])
    .gte("published_at", isoBefore(o.mbcHours * H))
    .not("title", "ilike", "%다시보기%")
    .not("title", "ilike", "%[LIVE]%")
    .not("title", "ilike", "%실시간 스트리밍%")
    .order("published_at", { ascending: false })
    .limit(o.mbcLimit * 4);
  if (mbcErr) throw new Error(`${region.outlets.macro.name} 기사 수집 실패: ${mbcErr.message}`);
  const mbcAll = ((mbcRows as ArticleRow[] | null) ?? [])
    .map(rowToArticle)
    .filter((a) => !NON_STORY_RE.test(a.title) && isRegionalStory(a));
  const mbc = fillQuota(
    mbcAll.filter((a) => !exclude.has(a.id)),
    mbcAll.filter((a) => exclude.has(a.id)),
    o.mbcLimit,
  );

  const articles = uniqueById(paired, okinews, mbc);
  const okinewsCount = articles.filter((a) => a.source === "okinews").length;

  // 옥천 소식이 없는 날 — "오늘의 옥천" 코너를 채울 군청 공고 마감(오늘~7일 안, 가까운 순 2건)
  let okNotices: CollectedSources["okNotices"] = [];
  if (okinewsCount === 0) {
    const today = new Date(Date.now() + 9 * H).toISOString().slice(0, 10); // KST
    const weekLater = new Date(Date.now() + 8 * 24 * H + 9 * H).toISOString().slice(0, 10);
    const { data: nRows, error: nErr } = await supabase
      .from("articles")
      .select("title, raw")
      .eq("source", "oc_gov")
      .eq("kind", "notice")
      .gte("raw->>deadline", today)
      .lte("raw->>deadline", weekLater)
      .order("raw->>deadline", { ascending: true })
      .limit(2);
    if (nErr) throw new Error(`공고 마감 조회 실패: ${nErr.message}`);
    okNotices = ((nRows as { title: string; raw: { deadline?: string } | null }[] | null) ?? [])
      .filter((r) => typeof r.raw?.deadline === "string")
      .map((r) => ({ title: r.title, deadline: r.raw!.deadline! }));
  }

  // 인기 댓글 — 좋아요순 TOP N. 수집 기사에 달린 댓글로 제한한다.
  const articleIds = articles.map((a) => a.id);
  let comments: Comment[] = [];
  if (articleIds.length > 0) {
    const { data: commentRows, error: commentErr } = await supabase
      .from("comments")
      .select(COMMENT_COLUMNS)
      .in("article_id", articleIds)
      .order("like_count", { ascending: false })
      .limit(o.topComments);
    if (commentErr) throw new Error(`댓글 수집 실패: ${commentErr.message}`);
    comments = ((commentRows as CommentRow[] | null) ?? []).map(rowToComment);
  }

  return { articles, comments, pairs, okinewsCount, okNotices };
}
