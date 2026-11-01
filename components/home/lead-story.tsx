// ============================================================================
// components/home/lead-story — 1면 리드(좌 2/3): 오늘의 크로스뷰 대표 페어
//
// 키커(온도 색 도트 + 카테고리·온도) → 세리프 900 헤드라인(readingPoint, 따옴표
// 인용부는 --quote 톤) → 콤팩트 duo(좌 광역=네이비 채움/흰 텍스트, 우 기초=
// 페이퍼, 외곽 보더 없음) → 메타 줄(매칭 신뢰도 + "두 시선 비교하기"). duo 는 기존 "줄다리기"
// 호버(z2-tug: 호버/포커스 시 확장 + 발췌 2→4줄, 데스크탑·모션 허용에서만)를 계승.
//
// 페이지 유일 h1 = 이 헤드라인(리드). 서버 컴포넌트(클라이언트 훅 없음).
// ============================================================================

import Link from "next/link";
import type { CrossviewPairWithArticles } from "@/lib/matching";
import type { TemperatureBoardItem } from "@/types";
import { cn } from "@/lib/utils";
import { PressLabel } from "@/components/ui/press-label";
import { CrossviewPublisher } from "@/components/crossview/publisher-byline";
import { bandForTemperature } from "@/lib/temperature/formula";
import {
  confidencePercent,
  formatMonthDay,
  matchIssueTemperature,
  splitQuoted,
} from "./format";

interface LeadStoryProps {
  /** 대표 크로스뷰 페어 (없으면 소개 리드) */
  pair: CrossviewPairWithArticles | null;
  /** 기상도 온도 항목 (카테고리→온도 스파인 매핑용) */
  temperature: TemperatureBoardItem[];
}

/** 한 면(광역/기초)의 표시 데이터 */
interface SideContent {
  title: string;
  excerpt: string;
  /** 출처 소형캡(예: "7월 3일 보도"). 없으면 미표시 */
  source: string | null;
  href: string | null;
}

/** 좌측 광역 면 (딥 네이비 채움 + 흰 텍스트). z2-hero-macro 로 고대비 반전 유지. */
function MacroSide({ title, excerpt, source, href }: SideContent) {
  const base =
    "z2-hero-macro z2-tug flex flex-1 basis-0 flex-col gap-2 bg-brand p-4 md:p-5";
  const inner = (
    <>
      <PressLabel tier="macro" size="sm" inverse />
      <p className="font-display text-[19px] font-semibold leading-snug text-white">
        {title}
      </p>
      <p className="z2-tug-excerpt text-sm leading-relaxed text-white/85">
        {excerpt}
      </p>
      {source ? (
        <span className="mt-auto text-[11px] font-semibold uppercase tracking-[0.08em] text-white/60">
          {source}
        </span>
      ) : null}
    </>
  );
  if (!href) return <div className={base}>{inner}</div>;
  return (
    <Link
      href={href}
      aria-label={`광역의 시선 — ${title}. 두 시선 비교 보기`}
      className={cn(
        base,
        "transition-colors hover:bg-brand/95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/70",
      )}
    >
      {inner}
    </Link>
  );
}

/** 우측 기초 면 (웜 페이퍼). 좌면과 사이에 1px 잉크 괘선. */
function MicroSide({ title, excerpt, source, href }: SideContent) {
  const base =
    "z2-tug flex flex-1 basis-0 flex-col gap-2 border-t border-foreground bg-background p-4 md:border-l md:border-t-0 md:p-5";
  const inner = (
    <>
      <PressLabel tier="micro" size="sm" />
      <p className="font-display text-[19px] font-semibold leading-snug text-foreground">
        {title}
      </p>
      <p className="z2-tug-excerpt text-sm leading-relaxed text-muted-foreground">
        {excerpt}
      </p>
      {source ? (
        <span className="mt-auto text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {source}
        </span>
      ) : null}
    </>
  );
  if (!href) return <div className={base}>{inner}</div>;
  return (
    <Link
      href={href}
      aria-label={`기초의 시선 — ${title}. 두 시선 비교 보기`}
      className={cn(
        base,
        "transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-action",
      )}
    >
      {inner}
    </Link>
  );
}

/** 발행일 기반 출처 소형캡("7월 3일 보도"). 날짜 없으면 null. */
function sourceLine(publishedAt: string | null | undefined): string | null {
  const d = formatMonthDay(publishedAt);
  return d ? `${d} 보도` : null;
}

/** 1면 리드(좌 2/3) */
export function LeadStory({ pair, temperature }: LeadStoryProps) {
  const hasPair = pair != null;
  const readingPoint = pair?.readingPoint?.trim() || "같은 사안, 두 개의 시선";
  const segments = splitQuoted(readingPoint);

  // 키커 — macro 카테고리를 기상도 온도와 매핑해 스파인 색·온도 표기(없으면 중립)
  const macroCategory = pair?.macro?.category?.trim() || null;
  const tempItem = matchIssueTemperature(macroCategory, temperature);
  const band = tempItem ? bandForTemperature(tempItem.temperature) : null;
  const kickerText = macroCategory
    ? tempItem
      ? `${macroCategory} · ${Math.round(tempItem.temperature)}° ${band?.label ?? ""}`.trim()
      : macroCategory
    : hasPair
      ? "오늘의 크로스뷰"
      : "ZONE-2 · 두 시선으로 보는 지역 공론";

  const href = hasPair ? `/crossview/${pair.id}` : null;
  const confidence = confidencePercent(pair?.matchScore);

  const macro: SideContent = {
    title: pair?.macro?.title?.trim() || "광역 언론의 보도",
    excerpt:
      pair?.summaryMacro?.trim() ||
      "MBC충북이 이 사안을 어떻게 짚었는지 나란히 보여드립니다.",
    source: sourceLine(pair?.macro?.publishedAt),
    href,
  };
  const micro: SideContent = {
    title: pair?.micro?.title?.trim() || "기초 언론의 보도",
    excerpt:
      pair?.summaryMicro?.trim() ||
      "옥천신문이 현장에서 무엇을 봤는지 함께 대조합니다.",
    source: sourceLine(pair?.micro?.publishedAt),
    href,
  };

  return (
    <section aria-labelledby="lead-headline" className="flex flex-col">
      {hasPair ? <CrossviewPublisher compact className="mb-3" /> : null}

      {/* 키커 — 온도 색 도트 + 카테고리·온도 */}
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: band?.colorVar ?? "var(--line)" }}
        />
        <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {kickerText}
        </span>
      </div>

      {/* 세리프 900 헤드라인 (따옴표 인용부는 --quote 톤) */}
      <h1
        id="lead-headline"
        className="mt-2 break-keep text-balance font-display text-[clamp(1.875rem,3.4vw,2.75rem)] font-black leading-[1.12] tracking-tight text-foreground"
      >
        {segments.map((seg, i) =>
          seg.quoted ? (
            <span key={i} style={{ color: "var(--quote)" }}>
              {seg.text}
            </span>
          ) : (
            <span key={i}>{seg.text}</span>
          ),
        )}
      </h1>

      {/* 콤팩트 duo (외곽 보더 없음 — 네이비 필드 자체가 경계, 두 면 사이만 1px 잉크 이음매) */}
      <div className="mt-4 flex flex-col md:flex-row">
        <MacroSide {...macro} />
        <MicroSide {...micro} />
      </div>

      {/* 메타 줄 — 매칭 신뢰도 + 비교 CTA (여백으로 구분) */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm font-medium tabular-nums text-muted-foreground">
          {hasPair
            ? confidence != null
              ? `매칭 신뢰도 ${confidence}%`
              : "매칭 신뢰도 준비 중"
            : "곧 첫 크로스뷰가 도착합니다"}
        </span>
        <Link
          href={hasPair ? `/crossview/${pair.id}` : "/crossview"}
          className="group inline-flex min-h-11 items-center gap-2 rounded-md bg-foreground px-5 text-sm font-semibold text-background transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        >
          {hasPair ? "두 시선 비교하기" : "크로스뷰 보러 가기"}
          <span
            aria-hidden
            className="inline-block motion-safe:transition-transform motion-safe:group-hover:translate-x-0.5"
          >
            →
          </span>
        </Link>
      </div>
    </section>
  );
}
