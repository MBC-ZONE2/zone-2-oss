// ============================================================================
// /temperature/[issueId] — 이슈 온도 상세 (FR-TH-05·06, 검은 세계)
//
// 서버 컴포넌트: 이슈·24시간 추이·감정 분포를 anon + RLS 로 조회한다.
//   헤더(이슈명 · 대형 온도 숫자 · 배지) + 우측 점묘 온도계(뷰포트 40%)
//   + 24시간 추이 도트 스파크라인 + 감정 분포 도넛(자료 있을 때만 — 없으면 숨김).
// 존재하지 않는 이슈(또는 조회 실패)는 notFound. Next15: params 는 Promise.
// 데스크탑(≥1100px): .tw-issue — 머리 활자 .dk-read(760px) + 추이 차트 열 폭 확장(app/temperature.css).
//   해시태그 아래 .tw-issue-aside(데스크탑만 보임): 키워드 매칭 최근 댓글 3건
//   (lib/temperature/recent-comments — 키워드 3개·최근 7일·메타문자 이스케이프, 실패·없음 → 빈 배열)
//   — 댓글이 없으면 온도 추이 요약(현재·최고·24시간 변화)으로 대신 채운다.
//   모바일은 CSS 로만 숨기므로 쿼리는 그대로 돌지만 7일·limit 3 으로 비용을 잘랐다(API 신설 안 함).
// ============================================================================

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getIssueById,
  getIssueSentimentDist,
  getIssueTrend,
} from "@/lib/temperature/board";
import { bandForTemperature } from "@/lib/temperature/formula";
import type { SentimentDist } from "@/lib/temperature/board";
import { getRecentComments } from "@/lib/temperature/recent-comments";
import { getIssueArticles } from "@/lib/temperature/issue-articles";
import type { TemperaturePoint } from "@/types";
import { TemperatureBadge } from "@/components/ui/temperature-badge";
import { DotThermometer, SentimentDonut, TrendChart } from "@/components/temperature";
import "@/app/temperature.css";
import { sourceLabel } from "@/config/region";

export const dynamic = "force-dynamic";

const EMPTY_DIST: SentimentDist = { pos: 0, neu: 0, neg: 0 };

/** M월 D일 (Asia/Seoul) — 댓글 날짜 */
const DATE_FMT = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric" });
function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : DATE_FMT.format(d);
}

/** 댓글 본문 120자 절단(고령 독자용 2~3줄) */
function clip(body: string, max = 120): string {
  const t = body.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ issueId: string }>;
}): Promise<Metadata> {
  const { issueId } = await params;
  const issue = await getIssueById(issueId).catch(() => null);
  const title = issue?.label ?? "이슈 온도";
  return {
    title: `${title} · 공론 온도`, // layout template 이 " · ZONE-2" 를 붙인다
    description: `${title} 이슈의 24시간 온도 추이와 최근 7일 감정 분포입니다.`,
  };
}

export default async function IssueTemperaturePage({
  params,
}: {
  params: Promise<{ issueId: string }>;
}) {
  const { issueId } = await params;

  const issue = await getIssueById(issueId).catch(() => null);
  if (!issue) {
    notFound();
  }

  const [trend, sentimentDist, recent, related] = await Promise.all([
    getIssueTrend(issueId, 96).catch(() => [] as TemperaturePoint[]),
    getIssueSentimentDist(issueId).catch(() => EMPTY_DIST),
    getRecentComments(issue.keywords),
    getIssueArticles(issue.keywords ?? [], 6).catch(() => []),
  ]);

  // 현재 온도 = 가장 최근 추이 포인트 (없으면 0)
  const current = trend.length > 0 ? trend[trend.length - 1].temperature : 0;
  const band = bandForTemperature(current);
  const level = Math.min(1, Math.max(0, current / 100));
  const hasSentiment = sentimentDist.pos + sentimentDist.neu + sentimentDist.neg > 0;
  // 추이 요약(댓글이 없을 때 레일을 채운다): 최고·24시간 변화(첫 포인트 대비)
  const maxT = trend.reduce((m, p) => Math.max(m, p.temperature), 0);
  const delta = trend.length > 1 ? Math.round(current - trend[0].temperature) : 0;

  return (
    <main className="tw tw-issue" aria-labelledby="issue-title">
      <Link href="/temperature" className="tw-back">
        <span aria-hidden>←</span> 공론 온도계
      </Link>

      <header className="tw-issue-head">
        <div className="dk-read">
          <p className="tw-eyebrow">공론 온도 · 사안</p>
          <h1 id="issue-title" className="tw-issue-title">
            {issue.label}
          </h1>
          <div className="tw-issue-temp">
            <span className="tw-num" aria-hidden>
              {Math.round(current)}
              <small>°</small>
            </span>
            <TemperatureBadge temperature={current} size="md" />
          </div>
          {issue.keywords && issue.keywords.length > 0 ? (
            <ul className="tw-keywords" aria-label="키워드">
              {issue.keywords.slice(0, 6).map((kw) => (
                <li key={kw}>#{kw}</li>
              ))}
            </ul>
          ) : null}
          {/* 데스크탑 전용 — 온도계 옆 빈 면: 최근 댓글 3건, 없으면 추이 요약 */}
          {recent.length > 0 ? (
            <section className="tw-issue-aside" aria-label="이 사안의 최근 댓글">
              <p className="tw-eyebrow">이 사안의 최근 댓글</p>
              <ul className="tw-recent">
                {recent.map((c) => (
                  <li key={c.id}>
                    <p className="tw-recent-body">{clip(c.body)}</p>
                    <p className="tw-recent-meta">
                      {sourceLabel(c.source)}
                      {c.publishedAt ? ` · ${fmtDate(c.publishedAt)}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ) : trend.length > 0 ? (
            <section className="tw-issue-aside" aria-label="온도 추이 요약">
              <p className="tw-eyebrow">온도 추이 요약</p>
              <dl className="tw-hero-dl">
                <div>
                  <dt>현재</dt>
                  <dd>{Math.round(current)}° · {band.label}</dd>
                </div>
                <div>
                  <dt>24시간 최고</dt>
                  <dd>{Math.round(maxT)}°</dd>
                </div>
                <div>
                  <dt>24시간 변화</dt>
                  <dd>{delta > 0 ? `+${delta}` : delta}°</dd>
                </div>
              </dl>
            </section>
          ) : null}
        </div>
        <div className="tw-thermo">
          <span className="tw-thermo-cap" aria-hidden>
            {Math.round(current)}°
          </span>
          <DotThermometer
            level={level}
            label={`점묘 온도계, ${issue.label} ${Math.round(current)}도 ${band.label}`}
          />
        </div>
      </header>

      {/* 관련 기사 — 이 사안에 연결된 지역 기사(lib/temperature/link 와 같은 규칙). 제목을 누르면 원문,
          크로스뷰로 엮인 기사는 "크로스뷰 보기". 없으면 섹션을 그리지 않는다. (2026-10-19 피드백: 온도계 → 기사) */}
      {related.length > 0 && (
        <section aria-labelledby="related-title" className="tw-section">
          <div className="tw-section-head">
            <h2 id="related-title" className="tw-h2">
              관련 기사
            </h2>
            <p className="tw-meta">최근 30일 · 제목을 누르면 원문</p>
          </div>
          <ul className="tw-articles">
            {related.map((a) => (
              <li key={a.id} className="tw-article">
                <p className="tw-article-meta">
                  {sourceLabel(a.source)}
                  {a.kind === "youtube" ? " · 영상" : ""}
                  {a.publishedAt ? ` · ${fmtDate(a.publishedAt)}` : ""}
                </p>
                {a.url ? (
                  <a href={a.url} target="_blank" rel="noopener noreferrer nofollow" className="tw-article-title">
                    {a.title} <span aria-hidden>↗</span>
                  </a>
                ) : (
                  <span className="tw-article-title">{a.title}</span>
                )}
                {a.pairId ? (
                  <Link href={`/crossview/${a.pairId}`} className="tw-link tw-article-cv">
                    크로스뷰 보기 →
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section
        aria-labelledby="trend-title"
        className={trend.length > 0 ? "tw-section" : "tw-section is-pending"}
      >
        <div className="tw-section-head">
          <h2 id="trend-title" className="tw-h2">
            온도 추이
          </h2>
          <p className="tw-meta">지난 24시간 · 15분 간격</p>
        </div>
        <TrendChart points={trend} color={band.colorVar} />
      </section>

      {hasSentiment && (
        <section aria-labelledby="sentiment-title" className="tw-section">
          <div className="tw-section-head">
            <h2 id="sentiment-title" className="tw-h2">
              감정 분포
            </h2>
            <p className="tw-meta">최근 7일</p>
          </div>
          <SentimentDonut dist={sentimentDist} />
        </section>
      )}
    </main>
  );
}
