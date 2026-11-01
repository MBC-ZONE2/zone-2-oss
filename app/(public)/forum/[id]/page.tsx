// ============================================================================
// /forum/[id] — 게시글 상세 페이지 (Server Component)
//
// 게시글 + 댓글을 서버에서 조립해 클라이언트(PostDetail)에 주입한다.
// 덧붙여 "이 사안 온도" 눈금용 온도 보드 매칭(키워드 휴리스틱)과 "↔ 크로스뷰"
// 링크용 페어 id 를 조회한다 — 둘 다 실패하면 없는 것으로(눈금·링크 생략).
// 우 레일 "다른 최신 건의" 5건(현재 글 제외, listPosts 재사용)도 실패하면 빈 배열.
// 게시글 조회(404 판단)만 먼저, 온도 보드·페어 id·최신 건의는 서로 독립이라 Promise.all 로 병렬.
// Next 15: params 는 Promise → await.
// ============================================================================

import { notFound } from "next/navigation";
import { getPostView } from "@/lib/forum";
import { listPosts } from "@/lib/forum/queries";
import type { ForumPost } from "@/types";
import { getTemperatureBoard } from "@/lib/temperature/board";
import { createClient } from "@/lib/supabase/server";
import { PostDetail } from "@/components/forum";
import { matchIssueTemp, type IssueTemp } from "@/components/forum/issue-temp";
import {
  loadPairIdsByArticleIds,
  type PairByArticle,
} from "@/components/forum/crossview-links";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ForumPostPage({ params }: PageProps) {
  const { id } = await params;

  const view = await getPostView(id, null);
  if (!view) notFound();

  // 온도 사안 매칭 — 가려짐/삭제 글은 본문이 비어 있어 자연히 null
  const loadIssue = async (): Promise<IssueTemp | null> => {
    try {
      const board = await getTemperatureBoard(8);
      return matchIssueTemp(`${view.post.title ?? ""} ${view.post.body}`, board.items);
    } catch {
      return null;
    }
  };

  // "↔ 크로스뷰" 링크용 페어 id — 기사 연결이 없으면 조회 생략
  const loadPairs = async (): Promise<PairByArticle> => {
    if (!view.post.articleId) return {};
    try {
      const supabase = await createClient();
      return await loadPairIdsByArticleIds(supabase, [view.post.articleId]);
    } catch {
      return {};
    }
  };

  // 우 레일 "다른 최신 건의" — 현재 글이 섞여 올 수 있어 6건 받아 빼고 5건
  const loadRelated = async (): Promise<ForumPost[]> => {
    try {
      const supabase = await createClient();
      const { posts } = await listPosts(supabase, undefined, 6);
      return posts.filter((p) => p.id !== view.post.id).slice(0, 5);
    } catch {
      return [];
    }
  };

  // 세 조회는 독립 → 병렬(각각 실패 폴백 내장)
  const [issue, pairByArticle, related] = await Promise.all([
    loadIssue(),
    loadPairs(),
    loadRelated(),
  ]);

  return (
    <PostDetail view={view} issue={issue} pairByArticle={pairByArticle} related={related} />
  );
}
