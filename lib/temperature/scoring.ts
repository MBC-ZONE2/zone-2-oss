// ============================================================================
// lib/temperature/scoring — 이슈 입력 → 정규화 → 온도 산출 → 랭킹
//
// 흐름:
//   1) 감정 미분류 댓글을 모아 classifySentiment(lib/ai) 배치 호출
//   2) 이슈별 raw 성분(빈도 decay / 감정분산 / 토픽집중도) 계산
//   3) raw 빈도를 이슈 간 Min-Max 로 정규화 → 온도 산출
//   4) 온도 내림차순 정렬 → rank 부여 + prevRank 매핑
//
// 외부 부수효과 없음(순수 계산 + AI 호출). DB I/O 는 compute.ts 가 담당.
// ============================================================================

import { classifySentimentDetailed } from "@/lib/ai/sentiment";
import type { Sentiment } from "@/types";
import {
  computeTemperature,
  decayWeightedFrequency,
  normalize,
  round1,
  sentimentVariance,
  topicConcentration,
} from "./formula";
import type {
  IssueInput,
  RawComponents,
  ScoredIssue,
  SentimentFillStats,
  TemperatureScoreInsert,
} from "./types";

/**
 * 감정 미분류 댓글을 한 번에 분류한다.
 * 이미 sentiment 가 있는 댓글은 그대로 두고, null 인 것만 AI 호출 대상으로 모은다.
 * 입력 IssueInput 을 변형하지 않고(불변) 새 배열을 반환한다.
 */
export async function fillSentiments(
  issues: IssueInput[],
): Promise<{ issues: IssueInput[]; stats: SentimentFillStats }> {
  // 분류가 필요한 (이슈index, 댓글index, 본문) 위치 수집
  const pending: { i: number; j: number; body: string }[] = [];
  issues.forEach((issue, i) => {
    issue.comments.forEach((c, j) => {
      if (c.sentiment == null) pending.push({ i, j, body: c.body });
    });
  });

  if (pending.length === 0) {
    return {
      issues,
      stats: { pending: 0, classified: 0, provider: null, fallback: 0, localFailed: false },
    };
  }

  // 배치 분류 (입력 순서와 동일한 순서로 결과가 온다는 계약). 경로·누락 통계를 함께 받는다(#181 결함 A)
  const batch = await classifySentimentDetailed(pending.map((p) => p.body));
  const labels = batch.labels;
  const stats: SentimentFillStats = {
    pending: pending.length,
    classified: pending.length - batch.fallback,
    provider: batch.provider,
    fallback: batch.fallback,
    localFailed: batch.localFailed,
  };

  // 위치별 결과를 맵으로
  const resolved = new Map<string, Sentiment>();
  pending.forEach((p, idx) => {
    const label = labels[idx];
    if (label) resolved.set(`${p.i}:${p.j}`, label);
  });

  // 불변 재구성
  const filledIssues = issues.map((issue, i) => ({
    ...issue,
    comments: issue.comments.map((c, j) => {
      if (c.sentiment != null) return c;
      const filled = resolved.get(`${i}:${j}`);
      return filled ? { ...c, sentiment: filled } : c;
    }),
  }));
  return { issues: filledIssues, stats };
}

/**
 * 이슈 1건의 raw 성분을 계산한다.
 * @param now 기준 시각 (decay 경과시간 계산용)
 */
export function rawComponentsFor(
  issue: IssueInput,
  now: Date,
): RawComponents {
  const nowMs = now.getTime();

  // 빈도: 각 댓글의 경과 시간(시간) → decay 가중 합
  const ageHours = issue.comments.map((c) => {
    if (!c.publishedAt) return 0; // 시각 불명 → 경과 0(최신 취급)
    const ts = new Date(c.publishedAt).getTime();
    if (!Number.isFinite(ts)) return 0;
    return Math.max(0, (nowMs - ts) / (1000 * 60 * 60));
  });
  const rawFrequency = decayWeightedFrequency(ageHours);

  // 감정 분산: 분류된 감정만 사용
  const sentiments = issue.comments
    .map((c) => c.sentiment)
    .filter((s): s is Sentiment => s != null);
  const sentVar = sentimentVariance(sentiments);

  // 토픽 집중도: 댓글 본문에서 이슈 키워드 등장 횟수 → HHI
  const counts = countKeywordHits(issue);
  const topicConc = topicConcentration(counts);

  return {
    issueId: issue.issueId,
    rawFrequency,
    sentimentVar: sentVar,
    topicConc,
  };
}

/** 이슈 키워드별 댓글 등장 횟수 (대소문자 무시, 단순 substring 카운트) */
function countKeywordHits(issue: IssueInput): number[] {
  const bodies = issue.comments.map((c) => c.body.toLowerCase());
  return issue.keywords.map((kw) => {
    const needle = kw.toLowerCase().trim();
    if (!needle) return 0;
    return bodies.reduce((sum, body) => (body.includes(needle) ? sum + 1 : sum), 0);
  });
}

/**
 * 여러 이슈의 raw 성분을 정규화하고 온도를 산출한다.
 * 빈도는 이슈 간 상대값이라 Min-Max 정규화하고, 분산/집중도는 이미 0~1 이라 그대로 쓴다.
 */
export function scoreIssues(raws: RawComponents[]): ScoredIssue[] {
  if (raws.length === 0) return [];

  const freqs = raws.map((r) => r.rawFrequency);
  const minF = Math.min(...freqs);
  const maxF = Math.max(...freqs);

  return raws.map((r) => {
    const freqNorm = normalize(r.rawFrequency, minF, maxF);
    const temperature = computeTemperature({
      frequency: freqNorm,
      sentimentVar: r.sentimentVar,
      topicConc: r.topicConc,
    });
    return {
      issueId: r.issueId,
      temperature: round1(temperature),
      frequency: round1(freqNorm * 100),
      sentimentVar: round1(r.sentimentVar * 100),
      topicConc: round1(r.topicConc * 100),
    };
  });
}

/**
 * 온도 내림차순 정렬 후 rank(1-base) 를 부여하고, prevRankByIssue 로 직전 순위를 매핑해
 * temperature_scores insert 행을 만든다. 동률은 issueId 로 안정 정렬.
 *
 * @param prevRankByIssue 직전 산출의 issueId→rank (변동 화살표용)
 * @param computedAt 산출 시각 ISO 문자열
 */
export function rankAndBuildRows(
  scored: ScoredIssue[],
  prevRankByIssue: Map<string, number>,
  computedAt: string,
): TemperatureScoreInsert[] {
  const sorted = [...scored].sort((a, b) => {
    if (b.temperature !== a.temperature) return b.temperature - a.temperature;
    return a.issueId.localeCompare(b.issueId);
  });

  return sorted.map((s, idx) => ({
    issue_id: s.issueId,
    temperature: s.temperature,
    frequency: s.frequency,
    sentiment_var: s.sentimentVar,
    topic_conc: s.topicConc,
    rank: idx + 1,
    prev_rank: prevRankByIssue.get(s.issueId) ?? null,
    computed_at: computedAt,
  }));
}
