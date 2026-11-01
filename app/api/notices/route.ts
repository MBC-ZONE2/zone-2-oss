// ============================================================================
// GET /api/notices — 옥천군청 고시·공고 목록 (혜택/공고 카드용)
//
// articles(source='oc_gov', kind='notice', category=게시판 4종) 를 공고일 내림차순으로.
// 응답 규약(docs/06 §2): { data, error }. 공개 GET: Supabase anon + RLS(articles_public_read).
// ============================================================================

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { NOTICE_CATEGORIES } from "@/components/home/action-layer";
import type { ApiResponse } from "@/types";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export interface NoticeItem {
  id: string;
  title: string;
  url: string | null;
  dept: string | null;
  notno: string | null;
  publishedAt: string | null;
}

export interface NoticeListResult {
  items: NoticeItem[];
}

function parseLimit(raw: string | null): number {
  const n = raw ? Number.parseInt(raw, 10) : DEFAULT_LIMIT;
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

export async function GET(
  request: NextRequest,
): Promise<NextResponse<ApiResponse<NoticeListResult>>> {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseLimit(searchParams.get("limit"));

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("articles")
      .select("id, title, url, published_at, raw")
      .eq("source", "oc_gov")
      .in("category", NOTICE_CATEGORIES)
      .order("published_at", { ascending: false })
      .limit(limit);
    if (error) throw error;

    const items: NoticeItem[] = (data ?? []).map((r) => {
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

    return NextResponse.json({ data: { items }, error: null });
  } catch (error) {
    console.error("[GET /api/notices] 실패:", error);
    return NextResponse.json(
      {
        data: null,
        error: { code: "notices_list_failed", message: "공고 목록을 불러오지 못했습니다." },
      },
      { status: 500 },
    );
  }
}
