// ============================================================================
// /crossview/[id] — 크로스뷰 상세 = 대비 지면 (FR-CD)
//
// 「일점 지면」 순서:
//   헤드라인 40/28px(card_headline ⋯/▬ 두 줄) → 실사 히어로(DotImage, 하단 3줄 점 디졸브)
//   → '광역이 본 것' ⋯ MBC충북 | '기초가 본 것' ▬ 옥천신문 두 칼럼(폰 상하)
//   → 'AI가 정리' 분홍 스탬프 + reading_point 인용괘선 → card_data.slides 가로 레일
//   → 원문 2링크(굵은 밑줄) → 본문 끝 한 줄 12px(매칭 신뢰도·AI 검수·공유)
//   → 공론장 검은 타일("댓글 N · 이 사안에 남긴 말" + 통일 작성기 <OpinionComposer> + 의견 목록).
// 데스크탑(≥1100, app/crossview.css)은 ①~⑤를 .cvp-main(좌 본문), ⑥~⑧을 .cvp-aside(우 sticky 레일)
// 로 2단 조판한다 — 래퍼는 폰에서 단순 블록이라 모바일 시각은 그대로. 활자 블록은 .dk-read(760px).
// 시그니처: 양쪽 articles.keywords 교집합 낱말만 잉크 700(순수 함수 keywordIntersection).
// 사진 없음 → 괘선 두 줄 + 헤드라인 40px.
//
// 서버 컴포넌트: Supabase anon + RLS 로 approved 페어만. 없으면 404.
// Next15: params 는 Promise 이므로 await 한다.
// loadDetail 은 React cache() 로 감싸 generateMetadata 와 페이지가 같은 요청 안에서
// 페어+공론장 조회를 1회만 실행한다(요청 단위 메모, next/cache 아님).
// ============================================================================

import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import type { ForumPost } from "@/types";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getApprovedPair, type CrossviewPairWithArticles } from "@/lib/matching";
import { listPostsByArticleIds } from "@/lib/forum/queries";
import { crossviewTitle } from "@/lib/reels/deck";
import { pairImage } from "@/lib/reels/pair-image";
import { region } from "@/config/region";
import { JsonLd } from "@/components/seo/json-ld";
import { absUrl, crossviewArticleJsonLd } from "@/lib/seo/site";
import {
  AiSummary,
  ForumPreview,
  LensView,
  Marker,
  OUTLET,
  ShareButton,
  TIER,
  confidencePercent,
  formatDate,
  keywordIntersection,
  splitHeadline,
} from "@/components/crossview";
import "@/app/crossview.css";

export const dynamic = "force-dynamic";

/** 공론장 조회 상한 — 검은 타일에 이만큼 전부 찍고, 닿으면 "공론장에서 더 보기 →" */
const FORUM_FETCH_LIMIT = 30;

/** 상세 데이터(페어 + 연결 공론장) — 실패는 null/빈 배열로 폴백.
 *  cache(): generateMetadata → 페이지 순으로 두 번 불려도 요청당 조회는 1회. */
const loadDetail = cache(async function loadDetail(id: string): Promise<{
  pair: CrossviewPairWithArticles | null;
  posts: ForumPost[];
  /** 중복 정리(#188)로 반려된 페어면 남은 페어 id — 공유 링크가 죽지 않게 넘겨준다 */
  redirectTo: string | null;
}> {
  try {
    const supabase = await createClient();
    const pair = await getApprovedPair(supabase, id);
    if (!pair) return { pair: null, posts: [], redirectTo: await findMergedTarget(id) };

    const articleIds = [pair.macro?.id, pair.micro?.id].filter(
      (v): v is string => Boolean(v),
    );
    let posts: ForumPost[] = [];
    try {
      posts = await listPostsByArticleIds(supabase, articleIds, FORUM_FETCH_LIMIT);
    } catch (e) {
      console.error("[/crossview/:id] 공론장 조회 실패:", e);
    }
    return { pair, posts, redirectTo: null };
  } catch (e) {
    console.error("[/crossview/:id] 상세 조회 실패:", e);
    return { pair: null, posts: [], redirectTo: null };
  }
});

/** 중복 정리로 반려된 페어의 대체 페어(moderation_logs.details.kind=dup_story) — 없으면 null */
async function findMergedTarget(id: string): Promise<string | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  try {
    const sb = createServiceClient();
    const { data } = await sb
      .from("moderation_logs")
      .select("details")
      .eq("target", "crossview")
      .eq("target_id", id)
      .in("action", ["cleanup", "reject"]) // 0026 이전 행은 reject 로 남아 있다
      .order("created_at", { ascending: false })
      .limit(5);
    for (const r of (data ?? []) as { details: Record<string, unknown> | null }[]) {
      if (r.details?.kind === "dup_story" && typeof r.details.keptPairId === "string") return r.details.keptPairId;
    }
  } catch {
    /* 안내 실패는 404 로 */
  }
  return null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const { pair, redirectTo } = await loadDetail(id);
  // 중복 정리로 반려된 페어 — 스트리밍 전인 여기서 307 로 남은 페어로 넘긴다(페이지 본문은 loading 경계 뒤라 200 이 먼저 나간다)
  if (!pair && redirectTo) redirect(`/crossview/${redirectTo}`);
  // 없는 페어는 여기서 404 확정 — 페이지 본문의 notFound() 는 loading 경계 뒤라 상태가 이미 200 으로 나간다
  if (!pair) notFound();
  const title = pair.cardHeadline?.trim() || pair.readingPoint?.trim() || "크로스뷰";
  const description =
    pair.readingPoint ??
    `${region.site.name} 크로스뷰가 광역과 기초 보도를 엮어 같은 사안을 설명합니다.`;
  // OG — 표지 사진 규칙은 화면과 같다: 옥천신문 원본 → MBC 원본 → AI 카드(WebP 1080px).
  // 셋 다 없으면 사이트 기본 OG(app/opengraph-image). 원본 사진은 세로비가 제각각이라
  // 1080×1350 단정은 AI 카드일 때만 붙인다.
  const ogPhoto = pairImage(pair);
  const image = ogPhoto.src ?? undefined;
  return {
    title, // layout 의 template("%s · ZONE-2")이 접미를 붙인다
    description,
    openGraph: {
      type: "article",
      title,
      description,
      url: `/crossview/${id}`,
      ...(image
        ? {
            images: [
              ogPhoto.kind === "ai"
                ? { url: image, width: 1080, height: 1350, alt: title }
                : { url: image, alt: title },
            ],
          }
        : {}),
    },
    twitter: { card: "summary_large_image", title, description, ...(image ? { images: [image] } : {}) },
  };
}

/** 헤드라인 한 줄 — 마커 + 스크린리더용 매체 라벨 + 활자 */
function HeadLine({ side, text }: { side: "macro" | "micro"; text: string }) {
  return (
    <span className={`cvp-head-line ${side}`}>
      <Marker side={side} />
      <span className="cvp-head-text">
        <span className="cvp-sr">
          {TIER[side]} {OUTLET[side]}:{" "}
        </span>
        {text}
      </span>
    </span>
  );
}

export default async function CrossviewDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { pair, posts, redirectTo } = await loadDetail(id);
  if (!pair && redirectTo) redirect(`/crossview/${redirectTo}`);
  if (!pair) notFound();

  const readingPoint = pair.readingPoint?.trim() || null;
  const category = pair.macro?.category ?? pair.micro?.category ?? null;
  const pct = confidencePercent(pair.matchScore);
  // 표시·구조화 데이터 모두 '최초 공개 시각'(0030 published_at, 없으면 생성 시각)으로 — 화면 날짜와 datePublished 가 같아야 한다
  const publishedIso = pair.publishedAt ?? pair.createdAt;
  const published = formatDate(publishedIso);

  // 헤드라인: card_headline(쉼표 두 줄) 우선, 없으면 crossviewTitle 폴백 한 줄
  const lines = splitHeadline(pair.cardHeadline);
  const shareTitle = pair.cardHeadline?.trim() || readingPoint || crossviewTitle(pair);

  // 두 시선 요약의 시그니처 — 양쪽 keywords 교집합 낱말만 잉크 700
  const keywords = keywordIntersection(pair.macro?.keywords, pair.micro?.keywords);

  // 크로스뷰 의견(댓글)은 이 페어의 기사에 연결한다(기초 우선, 없으면 광역).
  const commentArticleId = pair.micro?.id ?? pair.macro?.id ?? null;

  const sources = [
    pair.macro?.url ? { side: "macro" as const, url: pair.macro.url } : null,
    pair.micro?.url ? { side: "micro" as const, url: pair.micro.url } : null,
  ].filter((s): s is { side: "macro" | "micro"; url: string } => s !== null);

  // 구조화 데이터 — NewsArticle(발행=페어 생성 시각, 원문 2건은 isBasedOn). 이미지는 OG 와 같은 규칙(pairImage)
  const ld = crossviewArticleJsonLd({
    id,
    headline: shareTitle,
    description: readingPoint,
    datePublished: publishedIso,
    image: absUrl(pairImage(pair).src ?? null),
    section: category,
    keywords: keywords.length ? keywords : null,
    sources: [
      pair.macro?.url ? { name: region.outlets.macro.name, url: pair.macro.url, title: pair.macro.title, datePublished: pair.macro.publishedAt } : null,
      pair.micro?.url ? { name: region.outlets.micro.name, url: pair.micro.url, title: pair.micro.title, datePublished: pair.micro.publishedAt } : null,
    ].filter((s): s is NonNullable<typeof s> => s !== null),
  });

  return (
    <main className="cvp cvp-detail">
      <JsonLd data={ld} />
      <Link href="/crossview" className="cvp-back">
        <span aria-hidden>←</span> 크로스뷰 목록
      </Link>

      {/* 데스크탑 좌 본문(①~⑤) — 폰에서는 단순 블록 */}
      <div className="cvp-main">
        {/* ① 헤드라인 — ⋯/▬ 두 줄. 사진 없으면 괘선 두 줄 사이 40px(.xl) */}
        <header className="cvp-head-wrap dk-read">
          <h1 className="cvp-head xl">
            {lines.length === 2 ? (
              <>
                <HeadLine side="macro" text={lines[0]} />
                <HeadLine side="micro" text={lines[1]} />
              </>
            ) : (
              <span className="cvp-head-line plain">
                <span className="cvp-head-text">{lines[0] ?? crossviewTitle(pair)}</span>
              </span>
            )}
          </h1>
          <p className="cvp-head-meta">
            {published ? <time dateTime={pair.createdAt}>{published}</time> : null}
            {category ? <span>{category}</span> : null}
            <span>{region.outlets.macro.name} · {region.outlets.micro.name}</span>
          </p>
        </header>

        {/* ③ 두 시선 — 광역이 본 것 | 기초가 본 것: 기사 제목 + 관점 요약(교집합 낱말 잉크 700) + 원문.
            9/8 에 "홈 덱 카드 스토리가 보여 준다"며 뺐으나 목록·공유 링크·OG 유입은 홈 덱을 거치지 않아
            헤드라인만 보고 내용을 볼 곳이 없었다(시범단 #187, 2026-10-19 복원). 히어로·카드뉴스는 두지 않는다 —
            댓글이 주인공이라는 방향은 유지하고 본문은 두 시선 + AI 정리로 간결하게. */}
        <LensView
          macro={pair.macro}
          micro={pair.micro}
          summaryMacro={pair.summaryMacro}
          summaryMicro={pair.summaryMicro}
          keywords={keywords}
        />

        {/* ④ 'AI가 정리' 스탬프 + reading_point 인용괘선 — 없으면 블록 자체를 그리지 않는다 */}
        <AiSummary readingPoint={readingPoint} />
      </div>

      {/* 데스크탑 우 sticky 레일(⑥·⑦) — 폰에서는 본문 아래 이어지는 블록 */}
      <aside className="cvp-aside" aria-label="원문·공유">
        {/* ⑥ 원문 2링크 — 굵은 밑줄 */}
        {sources.length > 0 ? (
          <ul className="cvp-sources" aria-label="원문 기사">
            {sources.map((s) => (
              <li key={s.side}>
                <a href={s.url} target="_blank" rel="noopener noreferrer">
                  <Marker side={s.side} />
                  <span className="cvp-sr">{TIER[s.side]} · </span>
                  {OUTLET[s.side]} 원문 <span aria-hidden>↗</span>
                </a>
              </li>
            ))}
          </ul>
        ) : null}

        {/* ⑦ 본문 끝 한 줄 12px — 매칭 신뢰도 · AI 검수 · 공유 */}
        <p className="cvp-fine">
          <span>{pct != null ? `매칭 신뢰도 ${pct}%` : "매칭 신뢰도 준비 중"}</span>
          <span aria-hidden>·</span>
          <span title="AI가 생성하고 편집자가 검수한 콘텐츠입니다">AI 생성 · 편집자 검수</span>
          <span aria-hidden>·</span>
          <ShareButton
            title={`${region.site.name} 크로스뷰 · ${shareTitle}`}
            text={`${region.site.name} 크로스뷰가 두 언론사의 보도를 엮어 설명합니다.`}
          />
        </p>

      </aside>

      {/* ⑧ 공론장 — 검은 타일: "댓글 N · 이 사안에 남긴 말" + 작성기(OpinionComposer issue/dark)
          + 의견 목록(최대 FORUM_FETCH_LIMIT 건, 넘으면 "공론장에서 더 보기 →").
          데스크탑에서는 좁은 우 레일이 아니라 본문 열 아래 전폭(2행 1열)에 앉는다 — 레일 안 작성기는 비좁다. */}
      <section className="cvp-talk" aria-label="이 사안 댓글">
        <ForumPreview posts={posts} total={posts.length} articleId={commentArticleId} />
      </section>
    </main>
  );
}
