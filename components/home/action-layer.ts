// ============================================================================
// components/home/action-layer — "놓치면 손해"·"해결됐어요" 서버 헬퍼
//
// 행동 레이어 2종(마이그레이션 0008)의 홈 노출분을 조회한다. 두 테이블 모두
// 공개 SELECT 정책이 있어 anon 서버 클라이언트로 읽는다.
//   - 놓치면 손해: 마감 경과분 제외, 마감 가까운 순
//     · deadline_items(운영자 수기) + articles(oc_gov 공고 4종, raw.deadline — 스크래퍼가
//       상세 본문/목록 마감일 칸에서 뽑음)를 합쳐 마감 오름차순 → limit. 수기 항목이 비어도
//       군청 공고의 마감이 있으면 홈 '마감 D-day'·모바일 공고 띠가 자동으로 켜진다.
//   - 해결됐어요: 해결일 최신순
// 실패(테이블 없음·권한·네트워크)는 소스별로 흡수해 빈 배열 → 섹션 미노출
// (홈 불파괴 원칙, voices.ts 와 동일 패턴).
// ============================================================================

import { createClient } from "@/lib/supabase/server";

/** /notices 게시판 필터 슬러그 — 스크래퍼 raw.board 와 같은 어휘 */
export type NoticeBoardSlug = "notice" | "gosi" | "legis" | "recruit";

/**
 * 옥천군청 공고 게시판 4종(회의 결정 [4]). articles.category 에 한글명이 그대로 들어간다.
 * 공고를 읽는 모든 쿼리가 이 목록 하나만 본다 — 게시판이 늘면 여기만 고친다.
 */
export const NOTICE_BOARDS: { slug: NoticeBoardSlug; label: string }[] = [
  { slug: "notice", label: "공지사항" },
  { slug: "gosi", label: "고시공고" },
  { slug: "legis", label: "입법예고" },
  { slug: "recruit", label: "채용공고" },
];

/** articles.category 로 거를 때 쓰는 게시판 한글명 목록 */
export const NOTICE_CATEGORIES: string[] = NOTICE_BOARDS.map((b) => b.label);

/** 놓치면 손해 한 건 (표시용) */
export interface DeadlineItem {
  id: string;
  title: string;
  summary: string | null;
  benefitLabel: string | null;
  category: string | null;
  region: string | null;
  /** "YYYY-MM-DD" */
  deadline: string;
  sourceUrl: string | null;
  /** 오늘(KST) 기준 남은 일수 — 0 = 오늘 마감 */
  daysLeft: number;
}

/** 해결됐어요 한 건 (표시용) */
export interface ResolutionStory {
  id: string;
  title: string;
  timeline: string;
  reportedOn: string | null;
  resolvedOn: string | null;
  quote: string | null;
  quoteAuthor: string | null;
  /** 제보→해결 소요 일수 (양쪽 날짜가 있을 때만) */
  daysToResolve: number | null;
}

/** 오늘 날짜(KST) "YYYY-MM-DD" — 서버 렌더 결정론적 */
function todayKst(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
  }).format(new Date());
}

/** 날짜 문자열 간 일수 차 (b - a) */
function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

type Sb = Awaited<ReturnType<typeof createClient>>;

/** deadline_items(운영자 수기) — 마감 ≥ 오늘, 가까운 순 */
async function loadCuratedDeadlines(sb: Sb, today: string, limit: number): Promise<DeadlineItem[]> {
  try {
    const { data, error } = await sb
      .from("deadline_items")
      .select("id, title, summary, benefit_label, category, region, deadline, source_url")
      .gte("deadline", today)
      .order("deadline", { ascending: true })
      .limit(limit);
    if (error || !data) return [];
    return data.map((row) => ({
      id: row.id as string,
      title: row.title as string,
      summary: (row.summary as string | null) ?? null,
      benefitLabel: (row.benefit_label as string | null) ?? null,
      category: (row.category as string | null) ?? null,
      region: (row.region as string | null) ?? null,
      deadline: row.deadline as string,
      sourceUrl: (row.source_url as string | null) ?? null,
      daysLeft: daysBetween(today, row.deadline as string),
    }));
  } catch {
    return [];
  }
}

/**
 * articles(oc_gov 공고 4종) 중 raw.deadline ≥ 오늘 — 스크래퍼가 상세 본문(또는 채용공고
 * 목록의 마감일 칸)에서 뽑은 마감. raw->>deadline 은 "YYYY-MM-DD" 텍스트라 문자열 비교가
 * 날짜 순과 같다.
 * 부분 인덱스 articles_oc_notice_deadline_idx(0018)의 조건은 source='oc_gov' and kind='notice'
 * — 그래서 이 쿼리는 두 조건을 **반드시** 함께 걸어야 인덱스를 탄다(게시판 목록은
 * category IN 으로 좁히지만 그것만으로는 인덱스 조건을 함축하지 못한다).
 * category 자리에 담당 부서, summary 에 원문 기간 구간(예: "모집 기간: 9. 28. ~ 10. 8.")을 넣는다.
 */
async function loadNoticeDeadlines(sb: Sb, today: string, limit: number): Promise<DeadlineItem[]> {
  try {
    const { data, error } = await sb
      .from("articles")
      .select("id, title, url, raw")
      .eq("source", "oc_gov")
      .eq("kind", "notice")
      .in("category", NOTICE_CATEGORIES)
      .gte("raw->>deadline", today)
      .order("raw->>deadline", { ascending: true })
      .limit(limit);
    if (error || !data) return [];
    const out: DeadlineItem[] = [];
    for (const row of data) {
      const raw = (row.raw ?? {}) as { dept?: string; deadline?: string | null; period?: string | null };
      if (!raw.deadline || !/^\d{4}-\d{2}-\d{2}$/.test(raw.deadline)) continue;
      out.push({
        id: row.id as string,
        title: row.title as string,
        summary: raw.period ?? null,
        benefitLabel: null,
        category: raw.dept ?? null,
        region: null,
        deadline: raw.deadline,
        sourceUrl: (row.url as string | null) ?? null,
        daysLeft: daysBetween(today, raw.deadline),
      });
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * 마감이 지나지 않은 항목을 마감 가까운 순으로 조회한다.
 * 수기 deadline_items + 군청 공고(articles raw.deadline)를 합쳐 정렬(같은 날은 수기 먼저).
 * @param limit 반환 건수(기본 3)
 */
export async function getDeadlineItems(limit = 3): Promise<DeadlineItem[]> {
  try {
    const today = todayKst();
    const supabase = await createClient();
    const [curated, notices] = await Promise.all([
      loadCuratedDeadlines(supabase, today, limit),
      loadNoticeDeadlines(supabase, today, limit),
    ]);
    // 안정 정렬 — 같은 마감일이면 앞에 둔 수기 항목이 먼저
    return [...curated, ...notices]
      .sort((a, b) => (a.deadline < b.deadline ? -1 : a.deadline > b.deadline ? 1 : 0))
      .slice(0, limit);
  } catch {
    return [];
  }
}

/**
 * 해결 사례를 최신순으로 조회한다.
 * @param limit 반환 건수(기본 2)
 */
export async function getResolutionStories(limit = 2): Promise<ResolutionStory[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("resolution_stories")
      .select("id, title, timeline, reported_on, resolved_on, quote, quote_author")
      .order("resolved_on", { ascending: false, nullsFirst: false })
      .limit(limit);

    if (error || !data) return [];

    return data.map((row) => {
      const reportedOn = (row.reported_on as string | null) ?? null;
      const resolvedOn = (row.resolved_on as string | null) ?? null;
      return {
        id: row.id as string,
        title: row.title as string,
        timeline: row.timeline as string,
        reportedOn,
        resolvedOn,
        quote: (row.quote as string | null) ?? null,
        quoteAuthor: (row.quote_author as string | null) ?? null,
        daysToResolve:
          reportedOn && resolvedOn ? daysBetween(reportedOn, resolvedOn) : null,
      };
    });
  } catch {
    return [];
  }
}
