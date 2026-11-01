// ============================================================================
// GET /api/podcast — 발행된 팟캐스트 에피소드 목록 (published)
//
// 응답 규약(docs/06 §2): { data, error }, cursor 페이지네이션(?cursor=&limit=)
// 공개 GET: Supabase anon + RLS (published 만 노출).
// ?fields=list — 축약 응답: 전역 플레이어 큐(네비 재생 원 최신 회차·자동 다음 회차)가 쓰는 필드(id·title·audioUrl·durationSec·
//   publishedAt)만 남기고 script 등 무거운 필드를 뺀다(회차당 수 KB 절약). 기본은 전체 Episode.
//   회의 결정 [7]: 날짜만으로는 클릭 유인이 약해 대본에서 뽑은 대표 문장 lead(60자)를 함께 싣는다
//   (대본 전문은 여전히 제외 — 서버에서 episodeLead 로 한 문장만 추린다).
//   Figma 코멘트 #4(2026-09-11): title 이 날짜라 내용 축약이 아니다 → 표시용 headline 도 함께
//   내려 시트 행 부제로 쓴다. lead 는 기존 호출부 호환을 위해 남긴다(둘 다 내려간다).
// ============================================================================

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listPublishedEpisodes, episodeLead, episodeDisplayHeadline } from "@/lib/podcast";
import type { ApiResponse, Episode } from "@/types";
import type { EpisodeListResult } from "@/lib/podcast";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

/** ?fields=list 축약 항목 — 전역 플레이어 큐(components/player)가 읽는 최소 필드 + 예고 문장 */
export type EpisodeListItem = Pick<
  Episode,
  "id" | "title" | "audioUrl" | "durationSec" | "publishedAt"
> & {
  /** 대본에서 뽑은 대표 문장(60자 내). 못 뽑으면 "" */
  lead: string;
  /** 표시용 내용 요약 헤드라인 — DB 저장분(codex) 우선, 없으면 휴리스틱, 못 지으면 title */
  headline: string;
};

/** 축약 응답 형태 — items 원소만 다르고 { items, nextCursor } 규약은 동일 */
export interface EpisodeListSlimResult {
  items: EpisodeListItem[];
  nextCursor: string | null;
}

/** limit 파라미터 파싱 (1~MAX_LIMIT 로 클램프) */
function parseLimit(raw: string | null): number {
  const n = raw ? Number.parseInt(raw, 10) : DEFAULT_LIMIT;
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

/** Episode → 축약 항목(script·sourceRefs 등 제외) */
function toListItem(ep: Episode): EpisodeListItem {
  return {
    id: ep.id,
    title: ep.title,
    audioUrl: ep.audioUrl,
    durationSec: ep.durationSec,
    publishedAt: ep.publishedAt,
    lead: episodeLead(ep.script),
    headline: episodeDisplayHeadline(ep),
  };
}

export async function GET(
  request: NextRequest,
): Promise<NextResponse<ApiResponse<EpisodeListResult | EpisodeListSlimResult>>> {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseLimit(searchParams.get("limit"));
    const cursor = searchParams.get("cursor") ?? undefined;
    const slim = searchParams.get("fields") === "list";

    const supabase = await createClient();
    const result = await listPublishedEpisodes(supabase, limit, cursor);

    // 축약 모드: 대본 전문을 실어 보내지 않는다(기존 호출부는 fields 없이 전체 응답 그대로)
    if (slim) {
      return NextResponse.json({
        data: { items: result.items.map(toListItem), nextCursor: result.nextCursor },
        error: null,
      });
    }

    return NextResponse.json({ data: result, error: null });
  } catch (error) {
    console.error("[GET /api/podcast] 실패:", error);
    return NextResponse.json(
      {
        data: null,
        error: { code: "podcast_list_failed", message: "에피소드 목록을 불러오지 못했습니다." },
      },
      { status: 500 },
    );
  }
}
