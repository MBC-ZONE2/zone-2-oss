// ============================================================================
// components/home/contrast-floor — 하단 대조 지면 (굵은 잉크 괘선 상단)
//
// 크로스뷰 5~8번째 페어를 4단 그리드(md 2단)로 배치한다. 각 카드: 온도 색 도트
// (macro 카테고리를 기상도 이슈 온도와 매핑, 없으면 중립) + 세리프 제목(밑줄 성장
// 호버 z2-underline-grow) + 발췌 1줄 + 메타(카테고리·신뢰도). 서버 컴포넌트.
// 스크롤 리빌은 이 지면에만 적용한다(page 에서 Reveal 로 감쌈).
// ============================================================================

import Link from "next/link";
import type { CrossviewPairWithArticles } from "@/lib/matching";
import type { TemperatureBoardItem } from "@/types";
import { bandForTemperature } from "@/lib/temperature/formula";
import { confidencePercent, matchIssueTemperature } from "./format";

interface ContrastFloorProps {
  /** 홈 크로스뷰 전체 목록(최대 8). 이 지면은 5~8번째(slice(4,8))만 사용. */
  pairs: CrossviewPairWithArticles[];
  /** 기상도 온도 항목 (카테고리→스파인 색 매핑용) */
  temperature: TemperatureBoardItem[];
}

/** 대조 지면 카드 한 장 */
function FloorCard({
  pair,
  temperature,
}: {
  pair: CrossviewPairWithArticles;
  temperature: TemperatureBoardItem[];
}) {
  const category = pair.macro?.category?.trim() || null;
  const tempItem = matchIssueTemperature(category, temperature);
  const band = tempItem ? bandForTemperature(tempItem.temperature) : null;
  const confidence = confidencePercent(pair.matchScore);
  const readingPoint = pair.readingPoint?.trim() || "같은 사안, 두 개의 시선";
  const excerpt =
    pair.summaryMacro?.trim() || pair.summaryMicro?.trim() || "요약 준비 중";

  return (
    <Link
      href={`/crossview/${pair.id}`}
      className="z2-card z2-card-lift group flex gap-2.5 p-4 focus-visible:outline-none"
    >
      {/* 온도 색 도트 (카테고리 매핑 색, 없으면 중립 라인색) */}
      <span
        aria-hidden
        className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: band?.colorVar ?? "var(--line)" }}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <h3 className="z2-underline-grow w-fit break-keep font-display text-h2 font-semibold leading-snug text-foreground text-balance transition-colors group-hover:text-brand">
          {readingPoint}
        </h3>
        <p className="line-clamp-1 text-sm leading-relaxed text-muted-foreground">
          {excerpt}
        </p>
        <div className="flex items-center gap-2 text-xs tabular-nums text-muted-foreground">
          {category ? <span>{category}</span> : null}
          {category && confidence != null ? <span aria-hidden>·</span> : null}
          {confidence != null ? <span>신뢰도 {confidence}%</span> : null}
        </div>
      </div>
    </Link>
  );
}

/** 하단 대조 지면 — 크로스뷰 5~8번째 페어(없으면 미노출) */
export function ContrastFloor({ pairs, temperature }: ContrastFloorProps) {
  const floor = pairs.slice(4, 8);
  if (floor.length === 0) return null;

  return (
    <section
      aria-labelledby="floor-title"
      className="z2-rule-section flex flex-col gap-8 pt-8"
    >
      <div className="flex flex-col gap-1">
        <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          광역 × 기초 대조
        </span>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2
            id="floor-title"
            className="font-display text-h1 font-black tracking-tight text-foreground"
          >
            더 많은 크로스뷰
          </h2>
          <Link
            href="/crossview"
            className="group inline-flex min-h-11 items-center gap-1 rounded-md px-3 text-sm font-semibold text-action transition-colors hover:bg-surface-muted hover:text-action-hover"
          >
            크로스뷰 전체 보기
            <span
              aria-hidden
              className="inline-block motion-safe:transition-transform motion-safe:group-hover:translate-x-0.5"
            >
              →
            </span>
          </Link>
        </div>
      </div>

      <div className="grid gap-x-8 gap-y-6 md:grid-cols-2 xl:grid-cols-4">
        {floor.map((pair) => (
          <FloorCard key={pair.id} pair={pair} temperature={temperature} />
        ))}
      </div>
    </section>
  );
}
