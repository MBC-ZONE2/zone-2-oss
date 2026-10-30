// ============================================================================
// components/crossview/article-panel — 상세 한 칼럼 '광역이 본 것' / '기초가 본 것'
//
// 마커(⋯/▬) + 칼럼 제목 + 매체 아이콘·활자 병기 → 기사 제목(광역·기초 같은 굵기 700) →
// 요약 15px/1.75(교집합 낱말만 잉크 700, 나머지 보조 잉크 400) → 발행일·원문 링크.
// 카드·테두리 없음. 두 칼럼 사이 세로 괘선은 부모(lens-view)의 CSS 가 그린다.
// 서버 컴포넌트(훅 없음). 스타일: app/crossview.css(.cvp-colm)
// ============================================================================

import type { Article } from "@/types";
import { formatDate } from "./format";
import { KeywordText } from "./keyword-text";
import { Marker, OUTLET, TIER, type MarkerSide } from "./marker";
import { MediaIcon } from "@/components/ui/media-icon";
import { excerpt } from "./text";

/** 칼럼 제목 */
const COLUMN_TITLE: Record<MarkerSide, string> = {
  macro: "광역이 본 것",
  micro: "기초가 본 것",
};

/** 상세 한 칼럼 */
export function ArticlePanel({
  article,
  summary,
  accent,
  keywords = [],
}: {
  article: Article | null;
  /** 해당 관점 AI 요약 */
  summary: string | null;
  /** 광역(macro)/기초(micro) */
  accent: MarkerSide;
  /** 양쪽 keywords 교집합 — 잉크 700 강조 */
  keywords?: readonly string[];
}) {
  const headingId = `cvp-col-${accent}`;
  const summaryText = summary?.trim() || null;
  const bodyText = !summaryText && article?.body ? excerpt(article.body, 220) : null;
  const published = article ? formatDate(article.publishedAt) : "";

  return (
    <section className={`cvp-colm ${accent}`} aria-labelledby={headingId}>
      <div className="cvp-colm-k">
        <Marker side={accent} />
        <h2 id={headingId}>{COLUMN_TITLE[accent]}</h2>
        <span className="outlet">
          <MediaIcon kind={accent === "macro" ? "broadcast" : "paper"} className="cvp-mi" /> {/* 매체 아이콘(장식) */}
          <span className="cvp-sr">{TIER[accent]} · </span>
          {OUTLET[accent]}
        </span>
      </div>

      {article ? (
        <h3>{article.title}</h3>
      ) : (
        <p className="cvp-colm-empty">대응 보도가 없습니다.</p>
      )}

      {summaryText ? (
        <p className="cvp-colm-text">
          <KeywordText text={summaryText} keywords={keywords} />
        </p>
      ) : bodyText ? (
        <p className="cvp-colm-text">
          <KeywordText text={bodyText} keywords={keywords} />
        </p>
      ) : null}

      {article ? (
        <div className="cvp-colm-foot">
          {published ? (
            <time dateTime={article.publishedAt ?? undefined}>{published}</time>
          ) : null}
          {article.url ? (
            <a href={article.url} target="_blank" rel="noopener noreferrer">
              원문 보기 <span aria-hidden>↗</span>
            </a>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
