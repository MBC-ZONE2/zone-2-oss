// ============================================================================
// lib/forum/queries — Supabase 데이터 접근 (게시글/댓글)
//
// 담당: 통합 공론장(그룹 D).
// - 공개 목록/상세는 is_flagged=false 만 노출(RLS 와 별개로 방어적 필터).
// - cursor 페이지네이션: created_at desc 기준, 마지막 항목의 created_at 을 cursor 로.
// - 쓰기는 author_hash·모더레이션 결과를 받아서 insert (해시/모더레이션은 호출측 책임).
// DB 접근은 lib/supabase 클라이언트만 사용한다.
// ============================================================================

import type { ForumComment, ForumPost, ForumPostDetail } from "@/types";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  mapComment,
  mapPost,
  type ForumCommentRow,
  type ForumPostRow,
} from "./mappers";

/** lib/supabase/server.createClient() 의 인스턴스 타입 */
type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const POST_COLUMNS =
  "id, article_id, author_hash, display_name, title, body, image_url, like_count, is_flagged, flag_reason, deleted_at, created_at";
const COMMENT_COLUMNS =
  "id, post_id, author_hash, display_name, body, is_flagged, deleted_at, created_at";

/**
 * 글 id 들의 보이는 댓글 수(삭제·가려진 댓글 제외). 공개 RLS 가 이미 그 조건으로 거르므로
 * anon 클라이언트로도 맞게 센다. 실패하면 빈 맵(목록은 0 으로 표시).
 */
async function countVisibleComments(
  supabase: SupabaseServerClient,
  postIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (postIds.length === 0) return map;
  const { data, error } = await supabase
    .from("forum_comments")
    .select("post_id")
    .in("post_id", postIds)
    .is("deleted_at", null)
    .eq("is_flagged", false);
  if (error) {
    console.error("[forum] 댓글 수 집계 실패:", error.message);
    return map;
  }
  for (const r of (data ?? []) as { post_id: string | null }[]) {
    if (r.post_id) map.set(r.post_id, (map.get(r.post_id) ?? 0) + 1);
  }
  return map;
}

/** 목록 조회 결과 (cursor 포함) */
export interface ListPostsResult {
  posts: ForumPost[];
  /** 다음 페이지 cursor (없으면 null = 마지막 페이지) */
  nextCursor: string | null;
}

/**
 * 게시글 목록 (최신순, cursor 페이지네이션).
 * @param cursor 이전 페이지 마지막 게시글의 created_at(ISO). 그보다 과거 항목을 반환.
 * @param limit  페이지 크기(기본 20)
 */
export async function listPosts(
  supabase: SupabaseServerClient,
  cursor: string | undefined,
  limit: number,
): Promise<ListPostsResult> {
  let query = supabase
    .from("forum_posts")
    .select(POST_COLUMNS)
    .eq("is_flagged", false)
    .is("deleted_at", null) // 삭제된 글은 목록에서 제외 (상세에서만 자리표시자)
    .order("created_at", { ascending: false })
    .limit(limit + 1); // 다음 페이지 존재 여부 판별용으로 1개 더 가져온다

  if (cursor) {
    query = query.lt("created_at", cursor);
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as ForumPostRow[];
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const counts = await countVisibleComments(supabase, page.map((r) => r.id));
  const posts = page.map((r) => mapPost(r, counts.get(r.id) ?? 0));
  // 다음 페이지 cursor = 현재 페이지 마지막 게시글의 created_at(ISO)
  const nextCursor =
    hasMore && posts.length > 0 ? posts[posts.length - 1].createdAt : null;

  return { posts, nextCursor };
}

/**
 * 특정 기사들(article_id)에 연결된 게시글을 최신순으로 조회한다.
 * 크로스뷰 상세의 "연결 공론장 미리보기"용. 방어적으로 is_flagged=false 만 노출.
 * articleIds 가 비면 쿼리 없이 빈 배열을 반환한다.
 */
export async function listPostsByArticleIds(
  supabase: SupabaseServerClient,
  articleIds: string[],
  limit: number,
): Promise<ForumPost[]> {
  const ids = articleIds.filter((id): id is string => Boolean(id));
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from("forum_posts")
    .select(POST_COLUMNS)
    .in("article_id", ids)
    .eq("is_flagged", false)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  const rows = (data ?? []) as ForumPostRow[];
  const counts = await countVisibleComments(supabase, rows.map((r) => r.id));
  return rows.map((r) => mapPost(r, counts.get(r.id) ?? 0));
}

/**
 * 게시글 상세 + 댓글(오래된 순).
 * - 게시글이 없으면 null(→ 404).
 * - 가려진(플래그)·삭제된 글도 반환한다. 원문(body)은 mapPost 가 비우고, UI 가
 *   isFlagged/deletedAt 로 "가려진 글"/"삭제된 글" 자리표시자를 렌더한다.
 * - 댓글도 가려짐/삭제 여부와 무관하게 모두 반환한다(스레드 연속성). 본문은
 *   mapComment 가 원문을 비우고, UI 가 자리표시자를 렌더.
 * - 댓글 likeCount 는 여기서 0. reactions 집계는 상위 뷰(interactions)에서 주입.
 */
export async function getPostWithComments(
  supabase: SupabaseServerClient,
  postId: string,
): Promise<ForumPostDetail | null> {
  const { data: postData, error: postError } = await supabase
    .from("forum_posts")
    .select(POST_COLUMNS)
    .eq("id", postId)
    .maybeSingle();

  if (postError) throw postError;
  if (!postData) return null;

  const post = mapPost(postData as ForumPostRow);

  const { data: commentData, error: commentError } = await supabase
    .from("forum_comments")
    .select(COMMENT_COLUMNS)
    .eq("post_id", postId)
    .order("created_at", { ascending: true });

  if (commentError) throw commentError;

  const comments = ((commentData ?? []) as ForumCommentRow[]).map((row) =>
    mapComment(row),
  );
  const commentCount = comments.filter((c) => !c.deletedAt && !c.isFlagged).length;
  return { ...post, commentCount, comments };
}

/** 게시글 insert 입력 (해시·모더레이션 결과는 호출측에서 계산) */
export interface InsertPostInput {
  authorHash: string | null;
  /** 익명 작성자가 직접 입력한 닉네임. 미입력이면 null */
  displayName: string | null;
  passwordHash: string;
  authorIpHash: string | null;
  title: string | null;
  body: string;
  articleId: string | null;
  isFlagged: boolean;
  flagReason: string | null;
  /** 사진 1장 공개 URL(선택) */
  imageUrl?: string | null;
}

/** 게시글 작성 */
export async function insertPost(
  supabase: SupabaseServerClient,
  input: InsertPostInput,
): Promise<ForumPost> {
  const { data, error } = await supabase
    .from("forum_posts")
    .insert({
      author_hash: input.authorHash,
      display_name: input.displayName,
      edit_password_hash: input.passwordHash,
      author_ip_hash: input.authorIpHash,
      title: input.title,
      body: input.body,
      image_url: input.imageUrl ?? null,
      article_id: input.articleId,
      is_flagged: input.isFlagged,
      flag_reason: input.flagReason,
    })
    .select(POST_COLUMNS)
    .single();

  if (error) throw error;
  return mapPost(data as ForumPostRow);
}

/** 댓글 insert 입력 */
export interface InsertCommentInput {
  postId: string;
  authorHash: string | null;
  /** 익명 작성자가 직접 입력한 닉네임. 미입력이면 null */
  displayName: string | null;
  passwordHash: string;
  authorIpHash: string | null;
  body: string;
  isFlagged: boolean;
}

/** 댓글 작성 */
export async function insertComment(
  supabase: SupabaseServerClient,
  input: InsertCommentInput,
): Promise<ForumComment> {
  const { data, error } = await supabase
    .from("forum_comments")
    .insert({
      post_id: input.postId,
      author_hash: input.authorHash,
      display_name: input.displayName,
      edit_password_hash: input.passwordHash,
      author_ip_hash: input.authorIpHash,
      body: input.body,
      is_flagged: input.isFlagged,
    })
    .select(COMMENT_COLUMNS)
    .single();

  if (error) throw error;
  return mapComment(data as ForumCommentRow);
}

/** 게시글 존재 여부(댓글 작성 전 검증용) — 플래그 포함 존재만 확인 */
export async function postExists(
  supabase: SupabaseServerClient,
  postId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("forum_posts")
    .select("id")
    .eq("id", postId)
    .maybeSingle();

  if (error) throw error;
  return data !== null;
}

/** 비밀번호를 저장하는 포럼 테이블. */
export type PasswordTable = "forum_posts" | "forum_comments";

/** 수정/삭제 검증용 비밀번호 해시 조회. 공개 RLS를 우회하는 서버 전용 함수다. */
export async function fetchPasswordHash(
  table: PasswordTable,
  id: string,
): Promise<string | null> {
  const svc = createServiceClient();
  const { data, error } = await svc
    .from(table)
    .select("edit_password_hash")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data?.edit_password_hash ?? null;
}

/** 같은 IP 해시가 지정 시간 안에 글/댓글을 작성했는지 확인한다. */
export async function hasRecentWriteFromIp(
  table: PasswordTable,
  authorIpHash: string | null,
  seconds = 60,
): Promise<boolean> {
  if (!authorIpHash) return false;

  const svc = createServiceClient();
  const since = new Date(Date.now() - seconds * 1000).toISOString();
  const { data, error } = await svc
    .from(table)
    .select("id")
    .eq("author_ip_hash", authorIpHash)
    .gte("created_at", since)
    .limit(1);

  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

/** 게시글 제목/본문 수정. 이미 삭제된 글은 수정하지 않는다. */
export async function updatePost(
  id: string,
  input: { title: string | null; body: string },
): Promise<ForumPost | null> {
  const svc = createServiceClient();
  const { data, error } = await svc
    .from("forum_posts")
    .update({ title: input.title, body: input.body })
    .eq("id", id)
    .is("deleted_at", null)
    .select(POST_COLUMNS)
    .maybeSingle();

  if (error) throw error;
  return data ? mapPost(data as ForumPostRow) : null;
}

async function softDeleteRow(
  table: PasswordTable,
  id: string,
): Promise<boolean> {
  const svc = createServiceClient();
  const { data, error } = await svc
    .from(table)
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .is("deleted_at", null)
    .select("id");

  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

/** 게시글 소프트 삭제. */
export function softDeletePost(id: string): Promise<boolean> {
  return softDeleteRow("forum_posts", id);
}

/** 댓글 수정 — 비밀번호 검증은 라우트에서 선행. */
export async function updateComment(
  id: string,
  input: { body: string },
): Promise<ForumComment | null> {
  const svc = createServiceClient();
  const { data, error } = await svc
    .from("forum_comments")
    .update({ body: input.body })
    .eq("id", id)
    .is("deleted_at", null)
    .select(COMMENT_COLUMNS)
    .maybeSingle();

  if (error) throw error;
  return data ? mapComment(data as ForumCommentRow) : null;
}

/** 댓글 소프트 삭제. */
export function softDeleteComment(id: string): Promise<boolean> {
  return softDeleteRow("forum_comments", id);
}

// ---------------------------------------------------------------------------
// 사안(크로스뷰) 헤드 — 공론장 목록을 "크로스뷰 기반 사안"으로 묶기 위한 읽기 전용 조회
// ---------------------------------------------------------------------------

/** 글의 article_id 가 속한 승인 크로스뷰 페어의 헤드라인 정보 */
export interface IssueHead {
  /** crossview_pairs.id — /crossview/[pairId] 링크용 */
  pairId: string;
  /** card_headline(쉼표로 광역/기초 두 줄) → 없으면 reading_point 앞 40자 → 없으면 macroTitle */
  headline: string;
  /** 광역(MBC충북) 기사 제목 — 헤드라인 폴백·보조 표기 */
  macroTitle: string;
}

/** articleId → IssueHead */
export type IssueHeadByArticle = Record<string, IssueHead>;

const ARTICLE_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface IssueHeadRow {
  id: string;
  article_macro: string | null;
  article_micro: string | null;
  card_headline: string | null;
  reading_point: string | null;
  macro: { title: string | null } | { title: string | null }[] | null;
}

/** 공백 정리 후 앞 max 자 발췌(넘치면 말줄임) */
function headExcerpt(text: string | null | undefined, max: number): string {
  const flat = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!flat) return "";
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

/**
 * 게시글들의 article_id → 승인(approved) 크로스뷰 페어 헤드 매핑.
 * article_macro 또는 article_micro 가 해당 기사인 페어 중 최신 1건을 고른다.
 * - 기존 함수는 건드리지 않는 읽기 전용 추가 함수.
 * - UUID 형식이 아닌 id 는 버리고, 비면 쿼리 없이 빈 맵. 조회 실패도 빈 맵(목록은 "자유 의견"으로 폴백).
 */
export async function getIssueHeadsForArticles(
  supabase: SupabaseServerClient,
  articleIds: Array<string | null | undefined>,
): Promise<IssueHeadByArticle> {
  const ids = Array.from(
    new Set(
      articleIds.filter(
        (id): id is string => Boolean(id) && ARTICLE_UUID_RE.test(String(id)),
      ),
    ),
  );
  if (ids.length === 0) return {};

  try {
    const list = `(${ids.join(",")})`;
    const { data, error } = await supabase
      .from("crossview_pairs")
      .select(
        "id, article_macro, article_micro, card_headline, reading_point, macro:articles!crossview_pairs_article_macro_fkey(title)",
      )
      .eq("status", "approved")
      .or(`article_macro.in.${list},article_micro.in.${list}`)
      .order("created_at", { ascending: false });
    if (error || !data) return {};

    const map: IssueHeadByArticle = {};
    for (const row of data as unknown as IssueHeadRow[]) {
      const macroRel = Array.isArray(row.macro) ? row.macro[0] : row.macro;
      const macroTitle = headExcerpt(macroRel?.title, 120);
      const headline =
        headExcerpt(row.card_headline, 120) ||
        headExcerpt(row.reading_point, 40) ||
        macroTitle;
      const head: IssueHead = { pairId: row.id, headline, macroTitle };
      // 최신순 정렬이므로 먼저 본 페어를 유지한다
      if (row.article_macro && !map[row.article_macro]) map[row.article_macro] = head;
      if (row.article_micro && !map[row.article_micro]) map[row.article_micro] = head;
    }
    return map;
  } catch {
    return {};
  }
}
