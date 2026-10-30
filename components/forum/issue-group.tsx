// ============================================================================
// components/forum/issue-group — 공론장 목록의 "사안 그룹" + 사안 헤드라인
//
// 공론장은 크로스뷰 기반이다 — 글을 연결 기사가 속한 크로스뷰 페어(사안)로 묶고,
// 그룹 헤더에 card_headline 을 ⋯(광역)/▬(기초) 마커 두 줄 20px 700 으로 찍는다.
// 헤더 전체가 /crossview/[pairId] 링크. 우측에 "의견 N". 헤더에 id="issue-<pairId>"
// 앵커(카드 스토리 등에서 /forum#issue-<pairId> 로 진입). 사안 매핑을 모르는 기사의
// 글(head=null)은 "다른 기사 의견" 그룹 — 자유 건의(article_id 없음)는 목록(post-list)이
// 별도 탭으로 가르므로 여기 오지 않는다.
// 그룹 사이 2px 괘선, 행 사이 1px(app/forum.css .fo-issue). 등장 애니메이션 없음.
// 순수 컴포넌트(훅 없음) — 목록(클라이언트)·상세(클라이언트) 어디서나 쓴다.
// 마커 색은 6px 도형에만, 매체는 스크린리더 라벨로 병기(색 의존 0).
// ============================================================================

import Link from "next/link";
import type { ReactNode } from "react";
import { splitHeadline } from "@/components/crossview/text";
import type { IssueHead } from "@/lib/forum/queries";

/** 사안 매핑이 없는 글(크로스뷰 페어를 모르는 기사) 그룹의 키 */
export const FREE_GROUP_KEY = "__free__";

/** 사안 헤드라인 — 쉼표 앞 광역 ⋯ / 뒤 기초 ▬ 두 줄. 쉼표 없으면 한 줄(마커 없음) */
export function IssueHeadline({
  head,
  as: Tag = "h2",
  id,
  className,
}: {
  head: IssueHead;
  /** 제목 요소 태그(목록 그룹 h2 / 상세 상단 p) */
  as?: "h2" | "h3" | "p";
  id?: string;
  className?: string;
}) {
  const lines = splitHeadline(head.headline);
  const cls = `fo-issue-head${className ? ` ${className}` : ""}`;
  if (lines.length < 2) {
    return (
      <Tag id={id} className={cls}>
        <span className="fo-issue-line plain">
          <span className="fo-issue-text">{lines[0] || head.macroTitle || "크로스뷰"}</span>
        </span>
      </Tag>
    );
  }
  return (
    <Tag id={id} className={cls}>
      <span className="fo-issue-line macro">
        <span className="mk mk-macro" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span className="fo-issue-text">
          <span className="fo-sr">광역 MBC충북: </span>
          {lines[0]}
        </span>
      </span>
      <span className="fo-issue-line micro">
        <span className="mk mk-micro" aria-hidden="true">
          <i />
        </span>
        <span className="fo-issue-text">
          <span className="fo-sr">기초 옥천신문: </span>
          {lines[1]}
        </span>
      </span>
    </Tag>
  );
}

/** 사안 그룹 — 헤더(헤드라인 링크 + "의견 N", id="issue-<pairId>") 아래 글 행 <ul> */
export function IssueGroup({
  head,
  count,
  children,
}: {
  /** null = 사안 매핑 없는 "다른 기사 의견" 그룹 */
  head: IssueHead | null;
  count: number;
  children: ReactNode;
}) {
  const key = head?.pairId ?? FREE_GROUP_KEY;
  const headingId = `fo-issue-${key}`;
  return (
    <section
      className="fo-issue"
      data-free={head ? undefined : ""}
      aria-labelledby={headingId}
    >
      {/* 앵커 — 스토리·크로스뷰에서 /forum#issue-<pairId> 로 이 사안에 바로 온다 */}
      <header
        className="fo-issue-hd"
        id={head ? `issue-${head.pairId}` : undefined}
      >
        {head ? (
          <Link
            href={`/crossview/${head.pairId}`}
            className="fo-issue-link"
            aria-label={`크로스뷰: ${head.headline}`}
          >
            <IssueHeadline head={head} id={headingId} />
          </Link>
        ) : (
          <h2 id={headingId} className="fo-issue-head free">
            <span className="fo-issue-line plain">
              <span className="fo-issue-text">다른 기사 의견</span>
            </span>
          </h2>
        )}
        <span className="fo-issue-count">의견 {count}</span>
      </header>
      <ul className="fo-rows">{children}</ul>
    </section>
  );
}
