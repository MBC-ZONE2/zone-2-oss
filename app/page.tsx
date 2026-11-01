// ============================================================================
// app/page — 홈 (릴스 세로 스냅 덱)
//
// 실 Supabase 에서 크로스뷰·공론 온도·오디오 브리핑·여론광장·군청 공고·마감·해결을 서버에서
// 취득해 buildDeck 으로 릴스형 덱을 구성하고, 클라이언트 <ReelsDeck> 에 주입한다.
// 데이터 소스별 실패는 흡수하고 빈 값으로 대체한다(홈은 절대 깨지지 않는다).
// 스냅샷/더미데이터는 쓰지 않는다 — 전부 실 조회 결과다.
// ============================================================================

import { createClient } from "@/lib/supabase/server";
import { listApprovedPairs } from "@/lib/matching";
import type { CrossviewPairWithArticles } from "@/lib/matching";
import { getTemperatureBoard } from "@/lib/temperature/board";
import { listPublishedEpisodes } from "@/lib/podcast/queries";
import { listPosts } from "@/lib/forum/queries";
import {
  getDeadlineItems,
  getResolutionStories,
  NOTICE_CATEGORIES,
  type DeadlineItem,
  type ResolutionStory,
} from "@/components/home/action-layer";
import { BOARD_LIMITS } from "@/components/home/fetch-board";
import type { Episode, ForumPost, TemperatureBoardItem } from "@/types";
import type { NoticeItem, ReelsData } from "@/lib/reels/deck";
import ReelsDeck from "@/components/reels/reels-deck";
import DesktopBoard from "@/components/reels/desktop-board";
import BrandIntro from "@/components/reels/brand-intro";

export const dynamic = "force-dynamic";

/** 덱에 필요한 승인 크로스뷰(최대 40건). 실패 시 빈 배열. */
async function fetchCrossview(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<CrossviewPairWithArticles[]> {
  try {
    // 40→24: 홈 HTML·DOM 절감(속도). 덱은 앞 8쌍만 쓰고 데스크탑 보드가 나머지를 쓴다.
    const { items } = await listApprovedPairs(supabase, { limit: 24 });
    return items;
  } catch {
    return [];
  }
}

/** 승인 크로스뷰 총계 — 끝 슬라이드 "전체 N쌍 보기" 문구용. 실패하면 undefined(숫자 없이 렌더) */
async function fetchCrossviewTotal(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<number | undefined> {
  try {
    const { count, error } = await supabase
      .from("crossview_pairs")
      .select("id", { count: "exact", head: true })
      .eq("status", "approved");
    return error || count === null ? undefined : count;
  } catch {
    return undefined;
  }
}

/** 공론 온도 보드(상위 8건, 이슈 라벨/키워드 조인). 실패 시 빈 값. */
async function fetchTemperature(): Promise<{
  items: TemperatureBoardItem[];
  computedAt: string | null;
}> {
  try {
    const board = await getTemperatureBoard(8);
    return { items: board.items, computedAt: board.computedAt || null };
  } catch {
    return { items: [], computedAt: null };
  }
}

/** 최신 발행 에피소드 1건. 실패 시 빈 배열. */
async function fetchEpisodes(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<Episode[]> {
  try {
    const { items } = await listPublishedEpisodes(supabase, 1);
    return items;
  } catch {
    return [];
  }
}

/** 여론광장 최신 게시글 10건. 실패 시 빈 배열. */
async function fetchForum(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<ForumPost[]> {
  try {
    const { posts } = await listPosts(supabase, undefined, 10);
    return posts;
  } catch {
    return [];
  }
}

/** 옥천군청 공고(articles source=oc_gov, 게시판 4종) 최신 10건. 실패 시 빈 배열. */
async function fetchNotices(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<NoticeItem[]> {
  try {
    const { data, error } = await supabase
      .from("articles")
      .select("id, title, url, published_at, raw")
      .eq("source", "oc_gov")
      .in("category", NOTICE_CATEGORIES)
      .order("published_at", { ascending: false })
      .limit(10);
    if (error) throw error;
    return (data ?? []).map((r) => {
      const raw = (r.raw ?? {}) as { dept?: string; notno?: string };
      return {
        id: r.id as string,
        title: r.title as string,
        url: (r.url as string | null) ?? null,
        dept: raw.dept ?? null,
        notno: raw.notno ?? null,
        publishedAt: (r.published_at as string | null) ?? null,
      };
    });
  } catch {
    return [];
  }
}

/** 놓치면 손해(마감 임박 순, daysLeft 는 KST 기준 서버 계산). 실패 시 빈 배열. */
async function fetchDeadlines(): Promise<DeadlineItem[]> {
  try {
    return await getDeadlineItems(BOARD_LIMITS.deadlines);
  } catch {
    return [];
  }
}

/** 해결됐어요(최신 해결 순). 실패 시 빈 배열. */
async function fetchResolutions(): Promise<ResolutionStory[]> {
  try {
    return await getResolutionStories(BOARD_LIMITS.resolutions);
  } catch {
    return [];
  }
}

export default async function Home() {
  const supabase = await createClient();

  // fetchHomeBoard 전체를 부르면 온도·크로스뷰가 중복 조회되므로 마감·해결 개별 함수만 쓴다
  const [crossview, crossviewTotal, temperature, episodes, forum, notices, deadlines, resolutions] =
    await Promise.all([
      fetchCrossview(supabase),
      fetchCrossviewTotal(supabase),
      fetchTemperature(),
      fetchEpisodes(supabase),
      fetchForum(supabase),
      fetchNotices(supabase),
      fetchDeadlines(),
      fetchResolutions(),
    ]);

  const data: ReelsData = {
    episodes,
    temperature: temperature.items,
    temperatureComputedAt: temperature.computedAt,
    crossview,
    crossviewTotal,
    notices,
    forum,
    // 모바일 공고 슬라이드 마감 띠용(가장 임박한 1건의 daysLeft 를 씀)
    deadlines,
  };

  // 모바일: 릴스 세로 스냅 덱(풀스크린) / 데스크톱: 보드형 레이아웃.
  // BrandIntro 는 모든 화면의 홈 진입 시 컨셉 영상 한 사이클을 재생한다.
  // ("오늘 하루 안보기"를 누른 당일에만 생략 · 모션 최소화 사용자는 항상 생략)
  return (
    <>
      <BrandIntro />
      <div className="only-mobile">
        <ReelsDeck data={data} />
      </div>
      <div className="only-desktop">
        <DesktopBoard data={data} deadlines={deadlines} resolutions={resolutions} />
      </div>
    </>
  );
}
