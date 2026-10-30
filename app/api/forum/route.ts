// ============================================================================
// /api/forum — 게시글 목록(GET) / 작성(POST)
//
// GET  : 공개 목록, cursor 페이지네이션. 응답 data = ForumPost[] (헤더로 nextCursor)
//        ?issueHeads=1 이면 data = { posts, issueHeads } — 그 페이지 기사들의
//        크로스뷰 사안 헤드 매핑을 함께 돌려준다(목록 "더 보기"가 사안 그룹에 묶기 위함).
// POST : 익명 작성. 비밀번호/IP 해시 저장 + 모더레이션 결과 반영 + 자동등록방지(captcha, 2026-10-19) + 사진 1장(imageUrl).
// 응답 규약: { data, error } (docs/06 §2)
// ============================================================================

import type { NextRequest } from "next/server";
import {
  CAPTCHA_MESSAGE,
  createPostSchema,
  clientIpFrom,
  errors,
  hashIp,
  hashPassword,
  hasRecentWriteFromIp,
  insertPost,
  isForumImageUrl,
  listPosts,
  listQuerySchema,
  ok,
  verifyCaptcha,
} from "@/lib/forum";
import { getIssueHeadsForArticles } from "@/lib/forum/queries";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { moderateText } from "@/lib/moderation";
import { loadOperatorDict } from "@/lib/moderation/operator-dict";

/**
 * GET /api/forum?cursor=&limit=&issueHeads=1
 * 최신순 게시글 목록. 다음 페이지 cursor 는 응답 헤더 X-Next-Cursor 로 전달.
 * issueHeads=1 이면 data 가 { posts, issueHeads } 로 바뀐다(기본은 ForumPost[] 유지).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const parsed = listQuerySchema.safeParse({
    cursor: searchParams.get("cursor") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) {
    return errors.validation(
      parsed.error.issues[0]?.message ?? "잘못된 쿼리 파라미터",
    );
  }

  try {
    const supabase = await createClient();
    const { posts, nextCursor } = await listPosts(
      supabase,
      parsed.data.cursor,
      parsed.data.limit,
    );

    // 사안 헤드 동봉 — 헤더는 한글을 못 실으므로 data 안에 넣는다. 실패해도 빈 맵.
    const withHeads = searchParams.get("issueHeads") === "1";
    const res = withHeads
      ? ok({
          posts,
          issueHeads: await getIssueHeadsForArticles(
            supabase,
            posts.map((p) => p.articleId),
          ),
        })
      : ok(posts);
    if (nextCursor) res.headers.set("X-Next-Cursor", nextCursor);
    return res;
  } catch (error) {
    console.error("[/api/forum GET] 목록 조회 실패:", error);
    return errors.internal();
  }
}

/**
 * POST /api/forum  body: { title?, body, articleId?, nickname?, password }
 * 익명 작성. 작성 시 모더레이션을 수행해 플래그 여부를 기록한다.
 */
export async function POST(request: NextRequest) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return errors.badJson();
  }

  const parsed = createPostSchema.safeParse(raw);
  if (!parsed.success) {
    return errors.validation(
      parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요",
    );
  }

  // 자동등록방지(2026-10-19): 서명 토큰·만료·3초 미만 제출·정답·재사용 검사. 실패는 422 로 사유를 돌려준다
  const captcha = await verifyCaptcha(parsed.data.captcha);
  if (!captcha.ok) return errors.validation(CAPTCHA_MESSAGE[captcha.code]);
  // 사진 URL 은 우리 버킷(/api/forum/image 결과)만
  if (parsed.data.imageUrl && !isForumImageUrl(parsed.data.imageUrl)) {
    return errors.validation("사진 주소가 올바르지 않습니다. 사진을 다시 올려 주세요");
  }

  try {
    const { title, body, articleId, nickname, password, imageUrl } = parsed.data;
    const authorIpHash = await hashIp(clientIpFrom(request.headers));

    if (
      await hasRecentWriteFromIp("forum_posts", authorIpHash, 60)
    ) {
      return errors.rateLimited("게시글은 60초에 한 번 작성할 수 있습니다");
    }

    const passwordHash = await hashPassword(password);

    // 모더레이션: 제목 + 본문 합쳐 검사 (시드 + 운영 사전)
    const extraDict = await loadOperatorDict();
    const moderation = await moderateText(
      [title, body].filter(Boolean).join("\n"),
      extraDict,
    );

    const post = await insertPost(createServiceClient(), {
      authorHash: authorIpHash,
      displayName: nickname,
      passwordHash,
      authorIpHash,
      title,
      body,
      imageUrl: imageUrl ?? null,
      articleId: articleId ?? null,
      isFlagged: moderation.flagged,
      flagReason: moderation.reason,
    });

    return ok(post, 201);
  } catch (error) {
    console.error("[/api/forum POST] 게시글 작성 실패:", error);
    return errors.internal();
  }
}
