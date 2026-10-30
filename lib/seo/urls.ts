// ============================================================================
// lib/seo/urls — 사이트맵·뉴스 사이트맵·RSS 가 공유하는 공개 URL 목록 (서버 전용, 10분 캐시)
//
// 공개된 것만 싣는다: 크로스뷰 approved · 팟캐 published · 온도 사안 · 공론장 글(삭제·플래그 아님).
// DB 를 못 읽으면 빈 배열 — 정적 페이지만 실린다(빌드·CI 처럼 env 없는 곳에서도 라우트가 죽지 않게).
// ============================================================================

import { unstable_cache } from "next/cache";
import { region } from "@/config/region";
import { createServiceClient } from "@/lib/supabase/server";

export interface SeoEntry {
  /** 사이트 내 경로("/crossview/…") */
  path: string;
  /** 제목(뉴스 사이트맵·RSS 용) */
  title: string;
  /** 설명(RSS 용) */
  description?: string | null;
  /** 최초 공개 시각 ISO */
  publishedAt: string;
  /** 마지막 변경 ISO(없으면 publishedAt) */
  updatedAt?: string | null;
  kind: "crossview" | "podcast" | "issue" | "forum";
}

async function load(): Promise<SeoEntry[]> {
  let sb: ReturnType<typeof createServiceClient>;
  try {
    sb = createServiceClient();
  } catch {
    return [];
  }
  const out: SeoEntry[] = [];
  try {
    const [cv, pod, iss, forum] = await Promise.all([
      sb
        .from("crossview_pairs")
        .select("id, created_at, published_at, card_headline, reading_point")
        .eq("status", "approved")
        .order("created_at", { ascending: false })
        .limit(5000),
      sb
        .from("podcast_episodes")
        .select("id, published_at, created_at, title, headline")
        .eq("status", "published")
        .order("published_at", { ascending: false })
        .limit(5000),
      sb.from("issues").select("id, label, created_at").order("created_at", { ascending: false }).limit(5000),
      sb
        .from("forum_posts")
        .select("id, title, created_at")
        .is("deleted_at", null)
        .eq("is_flagged", false)
        .order("created_at", { ascending: false })
        .limit(5000),
    ]);
    for (const r of cv.data ?? []) {
      out.push({
        kind: "crossview",
        path: `/crossview/${r.id}`,
        title: (r.card_headline as string | null)?.trim() || (r.reading_point as string | null)?.trim() || "크로스뷰",
        description: (r.reading_point as string | null) ?? null,
        // 최초 공개 시각(0030 published_at). 없으면 생성 시각
        publishedAt: (r.published_at as string | null) ?? (r.created_at as string),
      });
    }
    for (const r of pod.data ?? []) {
      out.push({
        kind: "podcast",
        path: `/podcast/${r.id}`,
        title: (r.headline as string | null)?.trim() || (r.title as string | null)?.trim() || region.podcast.seriesName,
        description: (r.title as string | null) ?? null,
        publishedAt: (r.published_at as string | null) ?? (r.created_at as string),
      });
    }
    for (const r of iss.data ?? []) {
      out.push({ kind: "issue", path: `/temperature/${r.id}`, title: `${r.label} · 공론 온도`, publishedAt: r.created_at as string });
    }
    for (const r of forum.data ?? []) {
      out.push({ kind: "forum", path: `/forum/${r.id}`, title: (r.title as string | null)?.trim() || "공론장 글", publishedAt: r.created_at as string });
    }
  } catch (e) {
    console.warn("[seo] 공개 URL 목록 조회 실패:", e instanceof Error ? e.message : e);
  }
  return out;
}

export const getSeoEntries = unstable_cache(load, ["seo-entries"], { revalidate: 600 });
