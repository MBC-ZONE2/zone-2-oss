"use client";

// ============================================================================
// components/forum/post-list — 2탭(사안 댓글 | 자유 건의) 목록 + "더 보기" 페이지네이션
//
// 서버에서 받은 초기 페이지와 사안 매핑(article_id → 크로스뷰 헤드)을 받아
// 글을 두 탭으로 가른다 — 기준은 article_id 유무.
//   · 사안 댓글: article_id 있는 글. 연결 기사가 속한 크로스뷰 페어(사안) 단위로
//     묶어 그린다(IssueGroup). "더 보기" 응답에 실린 사안 헤드는 issueHeads 상태에
//     병합하므로 추가 페이지의 기사도 사안 그룹에 붙는다. 그래도 매핑을 모르는
//     기사는 맨 아래 "다른 기사 의견" 그룹.
//   · 자유 건의: article_id 없는 글. 그룹 헤더 없이 평면 괘선 행.
// 탭 상태는 URL ?tab=issue|free 로 유지(서버 초기값 initialTab + history.replaceState).
// 탭은 WAI-ARIA 탭 계약대로 ←/→/Home/End 로 포커스+선택이 함께 움직인다.
// 기본 탭 = 사안 댓글(있으면), 없으면 자유 건의. #issue-<pairId> 앵커로 들어오면
// 사안 댓글 탭으로 맞춘다.
// 정렬 "최신순 · 인기순" 은 두 탭 공통 — 가로 스크롤 스트립(.fo-sort-scroll)이고
// 탭·정렬 줄의 "|" 세로막대는 없다(Figma #7, 2026-09-11).
// API 에 정렬 파라미터가 없어 불러온 글 안에서만
// 클라이언트 정렬한다(시각 정렬) — 그룹 순서 = 그룹 내 최신 글(최신순) /
// 공감 합(인기순), 그룹 안 행도 같은 기준. 추가 페이지는 /api/forum?issueHeads=1 로
// 받고(글 + 그 페이지의 사안 헤드), 응답 글도 article_id 유무로 탭에 배분한다.
// ============================================================================

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import type { ForumPost } from "@/types";
import type { IssueHead, IssueHeadByArticle } from "@/lib/forum/queries";
import { PostCard } from "./post-card";
import { FORUM_POSTED_EVENT } from "./opinion-composer";
import { fetchPosts, ForumApiError } from "./client-api";
import { IssueGroup, FREE_GROUP_KEY } from "./issue-group";
import "@/app/forum.css";

type SortKey = "recent" | "top";

/** 목록 탭 — 사안 댓글(article_id 있음) / 자유 건의(article_id 없음) */
import { parseForumTab, type ForumTab } from "./forum-tab";
export { parseForumTab, type ForumTab };

/** URL ?tab= 값 → 탭 키(그 외 값은 null) */
interface PostListProps {
  initialPosts: ForumPost[];
  initialCursor: string | null;
  /** 연결 기사 → 크로스뷰 사안 헤드 (서버 조회, 첫 페이지 기준. 추가 페이지는 클라이언트가 병합) */
  issueHeads?: IssueHeadByArticle;
  /** 서버가 ?tab= 에서 읽은 초기 탭. null 이면 사안 댓글(있으면) → 자유 건의 */
  initialTab?: ForumTab | null;
}

/** 화면에 그릴 사안 그룹 */
interface Group {
  key: string;
  head: IssueHead | null;
  posts: ForumPost[];
  /** 그룹 내 최신 글 createdAt(ISO) — 최신순 그룹 정렬 키 */
  latest: string;
  /** 공감 합 — 인기순 그룹 정렬 키 */
  likes: number;
}

/** 글 → 그룹 키(페어 id). 매핑을 모르는 기사면 "다른 기사 의견" 그룹 */
function groupKeyOf(post: ForumPost, heads: IssueHeadByArticle): string {
  const head = post.articleId ? heads[post.articleId] : undefined;
  return head ? head.pairId : FREE_GROUP_KEY;
}

/** 행 비교 — 최신순 / 공감순(동률이면 최신) */
function comparePosts(sort: SortKey) {
  return (a: ForumPost, b: ForumPost) =>
    sort === "top"
      ? b.likeCount - a.likeCount || b.createdAt.localeCompare(a.createdAt)
      : b.createdAt.localeCompare(a.createdAt);
}

/** 사안 댓글 글 목록 → 사안 그룹(정렬 반영, 매핑 없는 그룹은 항상 마지막) */
function buildGroups(
  posts: ForumPost[],
  heads: IssueHeadByArticle,
  sort: SortKey,
): Group[] {
  const map = new Map<string, Group>();
  for (const post of posts) {
    const key = groupKeyOf(post, heads);
    let group = map.get(key);
    if (!group) {
      const head =
        key === FREE_GROUP_KEY || !post.articleId ? null : heads[post.articleId] ?? null;
      group = { key, head, posts: [], latest: "", likes: 0 };
      map.set(key, group);
    }
    group.posts.push(post);
    group.likes += post.likeCount;
    if (post.createdAt > group.latest) group.latest = post.createdAt;
  }

  const byRow = comparePosts(sort);
  const groups = Array.from(map.values());
  for (const group of groups) group.posts.sort(byRow);
  groups.sort((a, b) => {
    // 매핑 없는 "다른 기사 의견"은 항상 맨 아래
    if (a.key === FREE_GROUP_KEY) return 1;
    if (b.key === FREE_GROUP_KEY) return -1;
    if (sort === "top") {
      return b.likes - a.likes || b.latest.localeCompare(a.latest);
    }
    return b.latest.localeCompare(a.latest);
  });
  return groups;
}

/** 탭 순서 — 방향키 이동 기준 */
const TAB_ORDER: ForumTab[] = ["free", "issue"]; // 자유 건의가 먼저(2026-10-19 피드백)

/** 현재 URL 의 ?tab= 을 바꿔 치환한다(내비게이션 없음, 뒤로가기 항목 추가 없음) */
function replaceTabInUrl(tab: ForumTab) {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tab);
    window.history.replaceState(window.history.state, "", url.toString());
  } catch {
    // URL 조작 실패는 화면 상태에 영향 없음
  }
}

export function PostList({
  initialPosts,
  initialCursor,
  issueHeads: initialIssueHeads = {},
  initialTab = null,
}: PostListProps) {
  const [posts, setPosts] = useState<ForumPost[]>(initialPosts);
  // 사안 헤드 매핑 — 서버 초기값에서 시작해 "더 보기" 응답의 매핑을 병합한다
  const [issueHeads, setIssueHeads] =
    useState<IssueHeadByArticle>(initialIssueHeads);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("recent");
  // 기본 탭 — URL 값 > 자유 건의(2026-10-19 피드백: 자유 건의 우선 노출)
  const [tab, setTab] = useState<ForumTab>(() => initialTab ?? "free");

  // article_id 유무로 두 탭에 배분 — 추가 로드된 글도 같은 기준
  const { issuePosts, freePosts } = useMemo(() => {
    const issue: ForumPost[] = [];
    const free: ForumPost[] = [];
    for (const post of posts) (post.articleId ? issue : free).push(post);
    return { issuePosts: issue, freePosts: free };
  }, [posts]);

  const groups = useMemo(
    () => buildGroups(issuePosts, issueHeads, sort),
    [issuePosts, issueHeads, sort],
  );
  const freeRows = useMemo(
    () => [...freePosts].sort(comparePosts(sort)),
    [freePosts, sort],
  );

  // #issue-<pairId> 앵커로 진입하면 사안 댓글 탭이어야 그룹이 보인다 — 기본 탭이 자유 건의라(2026-10-19)
  // 탭을 바꾼 뒤 그룹이 그려지면 앵커로 스크롤한다(브라우저의 첫 앵커 이동은 요소가 없어 실패한다)
  const hashScrolled = useRef(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash.startsWith("#issue-") && tab !== "issue") {
      setTab("issue");
    }
    // 마운트 시 한 번만 — 이후 탭 전환은 사용자 선택을 따른다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (tab !== "issue" || hashScrolled.current || typeof window === "undefined") return;
    const hash = window.location.hash;
    if (!hash.startsWith("#issue-")) return;
    const el = document.getElementById(hash.slice(1));
    if (!el) return;
    hashScrolled.current = true;
    el.scrollIntoView({ block: "start" });
  }, [tab, posts]);

  // 자유 건의 탭이 기본인데 최신 20건이 전부 사안 댓글이면 빈 탭으로 보인다 — 한 번 더 받아 채운다
  const autoFilled = useRef(false);
  useEffect(() => {
    if (tab !== "free" || autoFilled.current || loading || !cursor) return;
    if (posts.some((p) => !p.articleId)) return;
    autoFilled.current = true;
    void loadMore();
    // loadMore 는 안정적이지 않은 함수 선언 — 조건이 전부 state 라 의존성은 아래로 충분하다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, posts, loading, cursor]);

  function selectTab(next: ForumTab) {
    if (next === tab) return;
    setTab(next);
    replaceTabInUrl(next);
  }

  // 탭 버튼 참조 — 방향키로 포커스를 옮기기 위함
  const tabRefs = useRef<Record<ForumTab, HTMLButtonElement | null>>({
    issue: null,
    free: null,
  });

  /** 탭 키보드 — ←/→ 순환, Home/End 양끝. 포커스 이동과 선택을 함께 한다(자동 활성) */
  function onTabKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    const idx = TAB_ORDER.indexOf(tab);
    let nextIdx: number | null = null;
    switch (e.key) {
      case "ArrowRight":
        nextIdx = (idx + 1) % TAB_ORDER.length;
        break;
      case "ArrowLeft":
        nextIdx = (idx - 1 + TAB_ORDER.length) % TAB_ORDER.length;
        break;
      case "Home":
        nextIdx = 0;
        break;
      case "End":
        nextIdx = TAB_ORDER.length - 1;
        break;
      default:
        return;
    }
    e.preventDefault();
    const next = TAB_ORDER[nextIdx];
    selectTab(next);
    tabRefs.current[next]?.focus();
  }

  async function loadMore() {
    if (!cursor || loading) return;
    setLoading(true);
    setError(null);
    try {
      const page = await fetchPosts(cursor);
      // 응답 글은 article_id 유무로 탭에, 매핑을 먼저 병합해 새 기사도 사안 그룹에 붙는다
      // (이미 아는 기사는 서버 초기 매핑을 우선)
      setIssueHeads((prev) => ({ ...page.issueHeads, ...prev }));
      setPosts((prev) => [...prev, ...page.posts]);
      setCursor(page.nextCursor);
    } catch (err) {
      setError(
        err instanceof ForumApiError
          ? err.message
          : "목록을 더 불러오지 못했습니다",
      );
    } finally {
      setLoading(false);
    }
  }

  // 아래 작성기에서 자유 건의를 올리면 — 자유 건의 탭으로, 맨 위에 끼우고(중복 방지), 그 글로 스크롤(2026-10-19)
  useEffect(() => {
    function onPosted(e: Event) {
      const post = (e as CustomEvent<ForumPost>).detail;
      if (!post?.id) return;
      setPosts((prev) => (prev.some((p) => p.id === post.id) ? prev : [post, ...prev]));
      setSort("recent");
      if (tab !== "free") {
        setTab("free");
        replaceTabInUrl("free");
      }
      window.setTimeout(() => {
        const el = document.getElementById(`post-${post.id}`) ?? document.getElementById("fo-panel-free");
        el?.scrollIntoView({ block: "start", behavior: "smooth" });
      }, 80);
    }
    window.addEventListener(FORUM_POSTED_EVENT, onPosted);
    return () => window.removeEventListener(FORUM_POSTED_EVENT, onPosted);
  }, [tab]);
  // 서버 목록이 새로 오면(router.refresh) 첫 글 기준으로 동기화 — 올린 글이 서버 순서로 자리 잡는다
  const firstServerId = initialPosts[0]?.id;
  useEffect(() => {
    setPosts((prev) => {
      if (prev[0]?.id === firstServerId) return prev;
      // 더 보기로 받아 둔 글은 유지하고 서버 첫 페이지를 앞에 둔다
      const seen = new Set(initialPosts.map((p) => p.id));
      return [...initialPosts, ...prev.filter((p) => !seen.has(p.id))];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstServerId]);

  function replacePost(updated: ForumPost) {
    setPosts((prev) =>
      prev.map((post) => (post.id === updated.id ? updated : post)),
    );
  }

  function removePost(id: string) {
    setPosts((prev) => prev.filter((item) => item.id !== id));
  }

  // 빈 상태 — 점선 괘선 + "첫 의견 남기기" 활자(기획안 (6))
  if (posts.length === 0) {
    return (
      <div className="fo-empty" style={{ marginInline: "var(--fo-gutter)" }}>
        <p>
          <a href="#post-form">첫 의견 남기기</a>
        </p>
        <small>지역 현안에 대한 여러분의 생각이 공론의 시작이 됩니다.</small>
      </div>
    );
  }

  const shownCount = tab === "issue" ? issuePosts.length : freeRows.length;

  return (
    <div>
      {/* 2탭 세그먼트 — "자유 건의 M  사안 댓글 N"(자유 건의 먼저, 2026-10-19). 텍스트 탭, 활성 잉크 굵게 + 2px 괘선
          (세로막대 구분자 없음 — Figma #7 ②) */}
      <div className="fo-tabs" role="tablist" aria-label="글 종류">
        <button
          type="button"
          role="tab"
          id="fo-tab-free"
          aria-selected={tab === "free"}
          aria-controls="fo-panel-free"
          tabIndex={tab === "free" ? 0 : -1}
          ref={(el) => {
            tabRefs.current.free = el;
          }}
          onClick={() => selectTab("free")}
          onKeyDown={onTabKeyDown}
        >
          자유 글 <b>{freeRows.length}</b>
        </button>
        <button
          type="button"
          role="tab"
          id="fo-tab-issue"
          aria-selected={tab === "issue"}
          aria-controls="fo-panel-issue"
          tabIndex={tab === "issue" ? 0 : -1}
          ref={(el) => {
            tabRefs.current.issue = el;
          }}
          onClick={() => selectTab("issue")}
          onKeyDown={onTabKeyDown}
        >
          사안 댓글 <b>{issuePosts.length}</b>
        </button>
      </div>

      {/* 정렬 줄 — 기준 버튼은 가로 스크롤 스트립 안에(Figma #7 ①),
          "N편" 은 스트립 밖에 두어 오른쪽에 고정된다 */}
      <div className="fo-sort" role="group" aria-label="정렬">
        <div className="fo-sort-scroll">
          <button
            type="button"
            aria-pressed={sort === "recent"}
            onClick={() => setSort("recent")}
          >
            최신순
          </button>
          <button
            type="button"
            aria-pressed={sort === "top"}
            onClick={() => setSort("top")}
          >
            인기순
          </button>
        </div>
        <span className="fo-count">{shownCount}편</span>
      </div>

      {tab === "issue" ? (
        <div
          className="fo-issues"
          role="tabpanel"
          id="fo-panel-issue"
          aria-labelledby="fo-tab-issue"
        >
          {groups.length === 0 ? (
            <div className="fo-empty fo-empty--tab">
              <p>아직 사안 댓글이 없습니다.</p>
              <small>
                기사에 대한 의견은 <Link href="/crossview">크로스뷰</Link> 화면에서 남기면
                사안에 묶여 이곳에 보입니다.
              </small>
            </div>
          ) : (
            groups.map((group) => (
              <IssueGroup key={group.key} head={group.head} count={group.posts.length}>
                {group.posts.map((post) => (
                  <li key={post.id}>
                    <PostCard
                      post={post}
                      onEdited={replacePost}
                      onDeleted={() => removePost(post.id)}
                    />
                  </li>
                ))}
              </IssueGroup>
            ))
          )}
        </div>
      ) : (
        <div
          className="fo-free"
          role="tabpanel"
          id="fo-panel-free"
          aria-labelledby="fo-tab-free"
        >
          {freeRows.length === 0 ? (
            <div className="fo-empty fo-empty--tab">
              <p>
                <a href="#post-form">첫 글 남기기</a>
              </p>
              <small>기사와 상관없는 이야기·제안은 아래 글쓰기에서 바로 올릴 수 있습니다.</small>
            </div>
          ) : (
            <ul className="fo-rows">
              {freeRows.map((post) => (
                <li key={post.id}>
                  <PostCard
                    post={post}
                    onEdited={replacePost}
                    onDeleted={() => removePost(post.id)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="fo-alert">
          {error}
        </p>
      )}

      {cursor && (
        <div className="fo-more">
          <button
            type="button"
            className="fo-textbtn"
            onClick={loadMore}
            disabled={loading}
            aria-busy={loading}
          >
            {loading ? "불러오는 중…" : "더 보기"}
          </button>
        </div>
      )}
    </div>
  );
}
