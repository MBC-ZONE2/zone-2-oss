// ============================================================================
// lib/matching/queries — 크로스뷰 페어 조회 (공개 API용)
//
// docs/06 §3: GET /api/crossview (approved 목록, cursor 페이지네이션)
//             GET /api/crossview/[id] (페어 상세)
// RLS로 anon은 approved만 보이지만, 쿼리에서도 status='approved'를 명시한다.
// 정렬은 created_at desc 기준, cursor는 created_at(ISO) 값을 사용한다.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Article, CrossviewPair } from "@/types";
import {
  toArticle,
  toCrossviewPair,
  type ArticleRow,
  type CrossviewPairRow,
} from "./mappers";
import { storyKey } from "./story";

/** 목록 응답에 포함되는 페어 (양측 기사 요약 정보 조인) */
export interface CrossviewPairWithArticles extends CrossviewPair {
  macro: Article | null;
  micro: Article | null;
}

/** GET /api/crossview 응답 (cursor 페이지네이션) */
export interface CrossviewListResult {
  items: CrossviewPairWithArticles[];
  /** 다음 페이지 커서 (더 없으면 null). 클라이언트는 불투명 토큰으로 취급한다. */
  nextCursor: string | null;
}

/**
 * 목록 정렬 기준.
 *  - latest: 최신순(created_at desc) — 기본값, 기존 계약(cursor=created_at) 유지
 *  - score:  매칭신뢰도순(match_score desc) — offset 기반 안정 정렬
 * ('온도높은순'은 페어-온도 데이터 연결이 없어 제외한다.)
 */
export type CrossviewSort = "latest" | "score";

/** listApprovedPairs 파라미터 */
export interface ListApprovedPairsParams {
  /** 페이지 커서 (정렬 기준에 따라 created_at 또는 offset). 불투명 토큰. */
  cursor?: string;
  /** 페이지 크기 (기본 20, 최대 50) */
  limit?: number;
  /** 카테고리 필터 (광역 기사 카테고리 기준). 미지정 시 전체 */
  category?: string;
  /** 정렬 기준 (기본 latest) */
  sort?: CrossviewSort;
}

/** 페어 조회 시 함께 가져올 컬럼 (embedding 제외 — 공개 응답에 불필요) */
const PAIR_COLUMNS =
  "id, article_macro, article_micro, similarity, match_score, summary_macro, summary_micro, reading_point, card_data, card_image_url, card_headline, status, created_at, published_at";

/**
 * 기사 공개 컬럼 (embedding/raw 제외).
 * 사진은 raw 통째로가 아니라 `image_url:raw->>imageUrl` 별칭 한 칸만 싣는다 —
 * 회의 결정 [3] 원본(옥천신문/MBC) 사진 우선 표시용. (정규화는 mappers.normalizeImageUrl)
 */
const ARTICLE_PUBLIC_COLUMNS =
  "id, source, kind, external_id, url, title, body, category, keywords, published_at, created_at, image_url:raw->>imageUrl";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

/** limit 정규화 (1~MAX_LIMIT, 기본 20) */
function normalizeLimit(limit?: number): number {
  if (!limit || Number.isNaN(limit) || limit <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.trunc(limit), MAX_LIMIT);
}

/** 공개 기사 row 형태 (embedding/raw 없음, 사진은 image_url 별칭으로만) */
type PublicArticleRow = Omit<ArticleRow, "embedding" | "raw">;

/**
 * 조인된 관계를 단일 row 로 정규화한다.
 * Supabase 타입 추론은 임베드 관계를 배열로 줄 수 있어(객체/배열 모두 방어)
 * 첫 요소를 취한다.
 */
function pickOne(relation: unknown): PublicArticleRow | null {
  if (Array.isArray(relation)) {
    return (relation[0] as PublicArticleRow | undefined) ?? null;
  }
  return (relation as PublicArticleRow | null) ?? null;
}

/** 공개 기사 row(embedding/raw 없음)를 Article로 매핑 (없는 필드는 null) */
function toPublicArticle(row: PublicArticleRow | null): Article | null {
  if (!row) return null;
  const a = toArticle({ ...row, embedding: null, raw: null });
  // 공개 API 는 원문 전문을 재배포하지 않는다 — 본문은 발췌(1,000자)까지만(저작권, 보안·법적 검수 2026-10-26).
  // 지금 수집분은 og:description 수준이라 실제로 잘리는 건 없고, 전문 피드로 바꿔도 공개 응답이 전문이 되지 않게 하는 상한이다.
  if (a.body && a.body.length > PUBLIC_BODY_MAX) a.body = `${a.body.slice(0, PUBLIC_BODY_MAX).trimEnd()}…`;
  return a;
}
const PUBLIC_BODY_MAX = 1000;

/** score 정렬용 offset 커서 파싱 (숫자 아니면 0) */
function parseOffset(cursor?: string): number {
  const n = cursor ? Number.parseInt(cursor, 10) : 0;
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * select 절 구성. 카테고리 필터 시 macro 를 inner join 으로 바꿔
 * 매칭 기사가 없는 페어를 상위 결과에서 제외한다(표시 카테고리=macro 우선과 정합).
 */
function selectClause(category?: string): string {
  const inner = category ? "!inner" : "";
  return (
    `${PAIR_COLUMNS}, ` +
    `macro:articles!crossview_pairs_article_macro_fkey${inner}(${ARTICLE_PUBLIC_COLUMNS}), ` +
    `micro:articles!crossview_pairs_article_micro_fkey(${ARTICLE_PUBLIC_COLUMNS})`
  );
}

/**
 * approved 페어 목록을 cursor 기반으로 조회한다.
 * 기본(latest): created_at desc, cursor=직전 페이지 마지막 created_at (기존 계약 유지).
 * score: match_score desc(+created_at desc 타이브레이크), cursor=offset.
 * limit+1건을 받아 다음 페이지 존재 여부를 판단한다.
 */
export async function listApprovedPairs(
  supabase: SupabaseClient,
  params: ListApprovedPairsParams = {},
): Promise<CrossviewListResult> {
  const limit = normalizeLimit(params.limit);
  const sort: CrossviewSort = params.sort === "score" ? "score" : "latest";
  const category = params.category?.trim() || undefined;
  const offset = sort === "score" ? parseOffset(params.cursor) : 0;

  let query = supabase
    .from("crossview_pairs")
    .select(selectClause(category))
    .eq("status", "approved");

  if (category) {
    query = query.eq("macro.category", category);
  }

  if (sort === "score") {
    query = query
      .order("match_score", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit); // inclusive → limit+1건
  } else {
    // 복합 keyset 커서(created_at|id): created_at 동률이 페이지 경계에
    // 걸릴 때 row 누락을 막는다(id 가 타이브레이커). 구형 커서(타임스탬프
    // 단독)는 하위호환으로 lt 만 적용한다.
    query = query
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit + 1);
    if (params.cursor) {
      const [ts, id] = splitLatestCursor(params.cursor);
      // or() 는 문자열 템플릿이라, ts 가 ISO 형태일 때만 복합 필터를 쓰고
      // 아니면 파라미터화되는 lt 로 안전 폴백한다(필터 인젝션 방지).
      const safeTs = /^[0-9TZ:.+-]+$/.test(ts);
      query =
        id && safeTs
          ? query.or(
              `created_at.lt."${ts}",and(created_at.eq."${ts}",id.lt.${id})`,
            )
          : query.lt("created_at", ts);
    }
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`크로스뷰 목록 조회 실패: ${error.message}`);
  }

  // 조인 결과 row 타입 — 관계는 객체/배열 모두 올 수 있어 unknown 으로 받는다.
  type JoinedRow = CrossviewPairRow & { macro: unknown; micro: unknown };

  const rows = (data ?? []) as unknown as JoinedRow[];
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;

  const mapped: CrossviewPairWithArticles[] = pageRows.map((row) => ({
    ...toCrossviewPair(row),
    macro: toPublicArticle(pickOne(row.macro)),
    micro: toPublicArticle(pickOne(row.micro)),
  }));
  // 같은 옥천 기사 + 같은 story(제목) 의 MBC 기사 페어는 페이지 안에서 첫 건만(#188) —
  // 매칭 단계가 막지만, 정리 전 데이터·경계 사례의 안전망. 커서는 원래 행 기준이라 그대로다.
  const seenStory = new Set<string>();
  const items = mapped.filter((p) => {
    const key = p.micro?.id && storyKey(p.macro?.title) ? `${p.micro.id}|${storyKey(p.macro?.title)}` : null;
    if (!key) return true;
    if (seenStory.has(key)) return false;
    seenStory.add(key);
    return true;
  });

  const last = pageRows[pageRows.length - 1];
  const nextCursor = !hasMore
    ? null
    : sort === "score"
      ? String(offset + limit)
      : last
        ? `${last.created_at}|${last.id}`
        : null;

  return { items, nextCursor };
}

/**
 * latest 커서 파싱 — "created_at|id"(복합) 또는 "created_at"(구형).
 * id 는 uuid 형태일 때만 신뢰한다(or 필터 인젝션 방지).
 */
function splitLatestCursor(cursor: string): [string, string | null] {
  const sep = cursor.lastIndexOf("|");
  if (sep === -1) return [cursor, null];
  const ts = cursor.slice(0, sep);
  const id = cursor.slice(sep + 1);
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  return [ts, isUuid ? id : null];
}

/**
 * approved 페어 1건을 id로 조회한다 (양측 기사 조인).
 * 없거나 approved가 아니면 null.
 */
export async function getApprovedPair(
  supabase: SupabaseClient,
  id: string,
): Promise<CrossviewPairWithArticles | null> {
  const { data, error } = await supabase
    .from("crossview_pairs")
    .select(
      `${PAIR_COLUMNS}, macro:articles!crossview_pairs_article_macro_fkey(${ARTICLE_PUBLIC_COLUMNS}), micro:articles!crossview_pairs_article_micro_fkey(${ARTICLE_PUBLIC_COLUMNS})`,
    )
    .eq("status", "approved")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`크로스뷰 상세 조회 실패: ${error.message}`);
  }
  if (!data) return null;

  type JoinedRow = CrossviewPairRow & { macro: unknown; micro: unknown };
  const row = data as unknown as JoinedRow;

  return {
    ...toCrossviewPair(row),
    macro: toPublicArticle(pickOne(row.macro)),
    micro: toPublicArticle(pickOne(row.micro)),
  };
}
