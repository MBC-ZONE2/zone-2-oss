// ============================================================================
// /forum — 공론장 목록 페이지 (Server Component) — 「일점 지면」 (5) 공론장
//
// 초기 게시글 한 페이지를 서버에서 직접 조회(lib/forum)해 렌더하고,
// 추가 로드는 클라이언트(PostList)가 /api/forum 으로 처리한다.
// 조판: 마스트 → 해결 크림면(resolution_stories 있을 때, ResolutionBand 마운트) →
// 2탭 "사안 댓글 N · 자유 건의 M"(?tab=issue|free) → 정렬 가로 스크롤 스트립
// "최신순 · 인기순"(Figma #7: 세로막대 구분자 없음) →
// 사안 댓글 탭: 사안 그룹(크로스뷰 헤드라인 ⋯/▬ 두 줄 + "의견 N") 아래 괘선 행 /
// 자유 건의 탭: article_id 없는 글의 평면 괘선 행 →
// 글쓰기 "자유 건의 쓰기"(<OpinionComposer variant="free"> — 제목·본문·이름·비번 + '올리기' 블록)
// → 모바일 FAB(#post-form).
// 데스크탑(≥1100px, app/forum.css 끝 블록): .forum-list grid — 좌 .fo-list / 우 레일(크림면·작성기).
// 첫 페이지 글의 article_id 로 승인 크로스뷰 페어(사안) 헤드를 조회해 PostList 에 넘긴다.
// ============================================================================

import { listPosts } from "@/lib/forum";
import {
  getIssueHeadsForArticles,
  type IssueHeadByArticle,
} from "@/lib/forum/queries";
import { createClient } from "@/lib/supabase/server";
import { OpinionComposer, PostList, WriteFab } from "@/components/forum";
import { parseForumTab } from "@/components/forum/forum-tab";
import "@/app/forum.css";

// 쿠키/DB 를 읽으므로 매 요청 렌더한다.
export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

export default async function ForumPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  // ?tab=issue|free — 그 외 값은 null(PostList 가 사안 댓글 있으면 그쪽을 기본으로)
  const sp = await searchParams;
  const initialTab = parseForumTab(sp.tab);

  let initialPosts: Awaited<ReturnType<typeof listPosts>>["posts"] = [];
  let initialCursor: string | null = null;
  let loadError = false;
  let issueHeads: IssueHeadByArticle = {};

  try {
    const supabase = await createClient();
    const result = await listPosts(supabase, undefined, PAGE_SIZE);
    initialPosts = result.posts;
    initialCursor = result.nextCursor;
    // 사안 매핑 — 실패해도 빈 맵(전부 "자유 의견")으로 폴백
    issueHeads = await getIssueHeadsForArticles(
      supabase,
      initialPosts.map((p) => p.articleId),
    );
  } catch (error) {
    console.error("[/forum] 초기 목록 조회 실패:", error);
    loadError = true;
  }

  return (
    <main className="forum forum-page forum-list">
      {/* 제호 한 줄 — "공론장" 옆에 작게 "독자가 말한다"(2026-10-19 피드백: 탭을 위로 올려 폰에서 글이 더 보이게).
          '의견 쓰기 ↓' 링크는 글쓰기 버튼·레일 작성기와 겹쳐 뺐다(시범단 #180) */}
      <header className="fo-mast">
        <h1>
          공론장 <small className="fo-mast-sub">독자가 말한다</small>
        </h1>
      </header>

      {/* '해결됐어요' 크림면은 뺐다(2026-10-19 피드백) */}

      <section aria-label="게시글 목록" className="fo-list">
        {loadError ? (
          <p role="alert" className="fo-alert">
            목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
          </p>
        ) : (
          <PostList
            initialPosts={initialPosts}
            initialCursor={initialCursor}
            issueHeads={issueHeads}
            initialTab={initialTab}
          />
        )}
      </section>

      <section
        id="post-form"
        aria-labelledby="forum-write-heading"
        className="fo-write"
      >
        <h2 id="forum-write-heading">글쓰기</h2>
        <p className="fo-write-sub">
          기사에 대한 의견은 크로스뷰 화면에서 남기면 사안에 묶입니다.
        </p>
        <OpinionComposer variant="free" />
      </section>

      <WriteFab />
    </main>
  );
}
