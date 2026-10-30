// ============================================================================
// lib/metrics/report — 검증지표 보고서 (관리자 /admin/metrics · scripts/report/report-stage1 공용, #181)
//
// 결과보고서 5대 검증지표(docs/02) + 수집·생성 실적 + 일별 그리드를 한 객체로 만든다.
// 숫자는 전부 DB 실측이며, 측정할 수 없으면 **숫자를 만들지 않고** verdict="na" 와 사유를 둔다.
// 일별 집계는 DB 함수 metrics_daily / metrics_visits(0022_metrics) 로 — PostgREST 로
// 수천 행을 끌어와 앱에서 더하지 않는다. service_role 클라이언트로 호출한다.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { region, sourceLabel } from "@/config/region";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { evaluatePrecision, TARGET_PRECISION, type EvalReport } from "./matching";
import { daysBetween, kstBounds, kstToday, resolvePeriod, shiftDate, shortRange, type Period, type PeriodKey } from "./period";

// ── 일별 ──────────────────────────────────────────────────────────────────
export interface DailyRow {
  day: string;
  ingestRuns: number;
  ingestOk: number;
  adaptersTotal: number;
  adaptersFailed: number;
  articlesUpserted: number;
  commentsUpserted: number;
  tempRuns: number;
  tempOk: number;
  /** stats 가 있는 실행의 여론 매칭 합 / 그 실행 수 (2026-10-11 이후) */
  tempMatchedSum: number;
  tempStatsRuns: number;
  /** 실행당 평균 여론 매칭 수(그날) — stats 가 없으면 null */
  tempMatchedAvg: number | null;
  tempClassified: number;
  tempPending: number;
  podcastPublished: boolean;
  podcastStatus: string | null;
  visitors: number;
}

interface DailyRpcRow {
  day: string;
  ingest_runs: number;
  ingest_ok: number;
  adapters_total: number;
  adapters_failed: number;
  articles_upserted: number;
  comments_upserted: number;
  temp_runs: number;
  temp_ok: number;
  temp_matched_sum: number;
  temp_stats_runs: number;
  temp_classified: number;
  temp_pending: number;
  podcast_published: boolean;
  podcast_status: string | null;
  visitors: number;
}

export async function fetchDaily(sb: SupabaseClient, since: string, until: string): Promise<DailyRow[]> {
  const { data, error } = await sb.rpc("metrics_daily", { p_since: since, p_until: until });
  if (error) throw new Error(`metrics_daily 실패: ${error.message} (0022_metrics 적용 여부 확인)`);
  return ((data ?? []) as DailyRpcRow[]).map((r) => ({
    day: r.day,
    ingestRuns: r.ingest_runs,
    ingestOk: r.ingest_ok,
    adaptersTotal: r.adapters_total,
    adaptersFailed: r.adapters_failed,
    articlesUpserted: r.articles_upserted,
    commentsUpserted: r.comments_upserted,
    tempRuns: r.temp_runs,
    tempOk: r.temp_ok,
    tempMatchedSum: r.temp_matched_sum,
    tempStatsRuns: r.temp_stats_runs,
    tempMatchedAvg: r.temp_stats_runs > 0 ? r.temp_matched_sum / r.temp_stats_runs : null,
    tempClassified: r.temp_classified,
    tempPending: r.temp_pending,
    podcastPublished: r.podcast_published,
    podcastStatus: r.podcast_status,
    visitors: r.visitors,
  }));
}

// ── 방문 ──────────────────────────────────────────────────────────────────
export interface VisitSummary {
  visitors: number;
  returning: number;
  visitDays: number;
  /** 재방문율 0~1, 방문자 0 이면 null */
  rate: number | null;
}

export async function fetchVisits(sb: SupabaseClient, since: string, until: string): Promise<VisitSummary> {
  const { data, error } = await sb.rpc("metrics_visits", { p_since: since, p_until: until });
  if (error) throw new Error(`metrics_visits 실패: ${error.message}`);
  const row = ((data ?? []) as { visitors: number; returning_visitors: number; visit_days: number }[])[0];
  const visitors = row?.visitors ?? 0;
  const returning = row?.returning_visitors ?? 0;
  return { visitors, returning, visitDays: row?.visit_days ?? 0, rate: visitors > 0 ? returning / visitors : null };
}

// ── 검수 승인율 ───────────────────────────────────────────────────────────
export type ApprovalTarget = "all" | "crossview" | "podcast" | "forum";
export interface ApprovalSummary {
  target: ApprovalTarget;
  approved: number;
  rejected: number;
  /** 한쪽 소속 확인(confirm) — 분모 제외, 참고용 */
  confirms: number;
  /** 팟캐 검수 마감 자동 공개(auto_publish) — 사람 검수가 아니라 분자·분모 모두 제외(#185) */
  autoPublished: number;
  /** 운영 정리(cleanup — 중복 페어 통합·기사 아닌 클립 제외, 0026) — 품질 반려가 아니라 분자·분모 모두 제외(#189) */
  cleanup: number;
  /** approved/(approved+rejected), 분모 0 이면 null */
  rate: number | null;
}

export async function fetchApproval(sb: SupabaseClient, since: string, until: string): Promise<ApprovalSummary[]> {
  const { fromIso, toIso } = kstBounds(since, until);
  const rows = await fetchAllRows<{ target: string; action: string; operator: string | null; details: Record<string, unknown> | null }>(
    (from, to) =>
      sb
        .from("moderation_logs")
        .select("target, action, operator, details")
        .gte("created_at", fromIso)
        .lt("created_at", toIso)
        .order("created_at", { ascending: true })
        .range(from, to),
    { max: 50_000, label: "moderation_logs" },
  );
  type Bucket = { approved: number; rejected: number; confirms: number; autoPublished: number; cleanup: number };
  const empty = (): Bucket => ({ approved: 0, rejected: 0, confirms: 0, autoPublished: 0, cleanup: 0 });
  const acc = new Map<ApprovalTarget, Bucket>();
  const bump = (t: ApprovalTarget, k: keyof Bucket) => {
    const cur = acc.get(t) ?? empty();
    cur[k] += 1;
    acc.set(t, cur);
  };
  for (const r of rows) {
    const t = (["crossview", "podcast", "forum"].includes(r.target) ? r.target : null) as ApprovalTarget | null;
    // 자동 공개(0023 action=auto_publish; 그 전 행은 approve + details.autoPublish)는 사람 검수가 아니다 — 따로 센다(#185)
    const isAuto = r.action === "auto_publish" || (r.action === "approve" && !!r.details && "autoPublish" in r.details);
    // 운영 정리(0026 action=cleanup; 그 전 행은 reject + operator null + details.kind dup_story/non_story)는 품질 반려가 아니다 — 따로 센다(#189)
    const kind = r.details && typeof r.details.kind === "string" ? r.details.kind : null;
    const isCleanup =
      r.action === "cleanup" || (r.action === "reject" && r.operator === null && (kind === "dup_story" || kind === "non_story"));
    const k: keyof Bucket | null = isAuto
      ? "autoPublished"
      : isCleanup
        ? "cleanup"
      : r.action === "approve" || r.action === "edit_approve"
        ? "approved"
        : r.action === "reject"
          ? "rejected"
          : r.action === "confirm"
            ? "confirms"
            : null;
    if (!k) continue;
    bump("all", k);
    if (t) bump(t, k);
  }
  const order: ApprovalTarget[] = ["all", "crossview", "podcast", "forum"];
  return order.map((target) => {
    const c = acc.get(target) ?? empty();
    const denom = c.approved + c.rejected;
    return { target, ...c, rate: denom > 0 ? c.approved / denom : null };
  });
}

/** 로그를 읽지 않고 만든 빈 승인율(측정 구간이 운영 검수 시작일보다 앞일 때) */
export function emptyApproval(): ApprovalSummary[] {
  const order: ApprovalTarget[] = ["all", "crossview", "podcast", "forum"];
  return order.map((target) => ({ target, approved: 0, rejected: 0, confirms: 0, autoPublished: 0, cleanup: 0, rate: null }));
}

// ── 수집·생성 실적 ────────────────────────────────────────────────────────
export interface Volume {
  key: string;
  label: string;
  /** 측정 구간 값(구간 개념이 없는 항목은 note 로 밝힌다). "전체 누적" 열은 2026-10-29 대표 지시로 없앴다 */
  period: number | null;
  note?: string;
}

type Filter = (q: ReturnType<SupabaseClient["from"]>["select"] extends never ? never : any) => any; // eslint-disable-line @typescript-eslint/no-explicit-any

async function countRows(
  sb: SupabaseClient,
  table: string,
  apply: Filter,
  range: { column: string; fromIso: string; toIso: string } | null,
): Promise<number | null> {
  try {
    let q = apply(sb.from(table).select("*", { count: "exact", head: true }));
    if (range) q = q.gte(range.column, range.fromIso).lt(range.column, range.toIso);
    const { count, error } = await q;
    if (error) {
      console.error(`[metrics] ${table} 집계 실패: ${error.message}`);
      return null;
    }
    return count ?? 0;
  } catch (e) {
    console.error(`[metrics] ${table} 집계 실패:`, e);
    return null;
  }
}

export async function fetchVolumes(sb: SupabaseClient, period: Period, visits: VisitSummary): Promise<Volume[]> {
  const { fromIso, toIso } = kstBounds(period.since, period.until);
  const createdIn = { column: "created_at", fromIso, toIso };
  const defs: { key: string; label: string; table: string; apply: Filter; column?: string; note?: string }[] = [
    { key: "mbc_news", label: `기사 — ${sourceLabel("mbc_cb")} 뉴스`, table: "articles", apply: (q) => q.eq("source", "mbc_cb").eq("kind", "news") },
    { key: "mbc_youtube", label: `기사 — ${sourceLabel("mbc_cb")} 유튜브`, table: "articles", apply: (q) => q.eq("source", "mbc_cb").eq("kind", "youtube") },
    { key: "okinews", label: `기사 — ${sourceLabel("okinews")}`, table: "articles", apply: (q) => q.eq("source", "okinews") },
    { key: "oc_notice", label: region.government.noticesLabel, table: "articles", apply: (q) => q.eq("source", "oc_gov") },
    { key: "comments", label: "댓글·여론(유튜브·여론광장)", table: "comments", apply: (q) => q },
    { key: "pairs_approved", label: "크로스뷰 — 승인 쌍", table: "crossview_pairs", apply: (q) => q.eq("status", "approved") },
    { key: "pairs_candidate", label: "크로스뷰 — 후보(검수 대기)", table: "crossview_pairs", apply: (q) => q.eq("status", "candidate") },
    { key: "episodes", label: "팟캐스트 — 공개 회차", table: "podcast_episodes", apply: (q) => q.eq("status", "published"), column: "scheduled_for" },
    { key: "forum_posts", label: "공론장 글(이용자 작성)", table: "forum_posts", apply: (q) => q.is("deleted_at", null) },
    { key: "forum_comments", label: "공론장 댓글", table: "forum_comments", apply: (q) => q },
  ];
  // 항목별 구간 집계를 전부 병렬로 — 순차 왕복이 페이지를 느리게 했다(codex 리뷰)
  const out: Volume[] = await Promise.all(
    defs.map(async (d) => {
      const range =
        d.column === "scheduled_for"
          ? { column: "scheduled_for", fromIso: period.since, toIso: shiftDate(period.until, 1) }
          : { ...createdIn, column: d.column ?? "created_at" };
      const p = await countRows(sb, d.table, d.apply, range);
      return { key: d.key, label: d.label, period: p, note: d.note };
    }),
  );
  // 누적 재생수 — 회차 play_count 합(구간 개념 없음)
  let plays: number | null = null;
  try {
    const { data } = await sb.from("podcast_episodes").select("play_count").eq("status", "published");
    plays = (data ?? []).reduce((s, r) => s + (Number((r as { play_count?: number }).play_count) || 0), 0);
  } catch {
    plays = null;
  }
  out.push({ key: "plays", label: "팟캐스트 — 재생(웹 내 재생 기준)", period: plays, note: "회차 play_count 합 — 날짜 구분 없는 카운터라 구간과 무관. KPI 월 500회" });
  out.push({ key: "visitors", label: "순방문자(자체 방문 기록)", period: visits.visitors, note: `${VISIT_MEASURE_START} 운영 배포 이후 기록` });
  return out;
}

// ── 지표 ──────────────────────────────────────────────────────────────────
export type Verdict = "pass" | "fail" | "na" | "manual";

export interface Indicator {
  no: string;
  key: "matching" | "ingest" | "temperature" | "podcast" | "revisit" | "approval";
  title: string;
  /** "≥ 70%" */
  target: string;
  /** 0~1 또는 null(측정 불가) */
  value: number | null;
  /** 화면 표시 문자열 */
  display: string;
  verdict: Verdict;
  /** 측정 구간 설명 */
  range: string;
  note: string;
  breakdown: { label: string; display: string }[];
}

export interface MetricsReport {
  period: Period;
  generatedAt: string;
  indicators: Indicator[];
  approval: ApprovalSummary[];
  volumes: Volume[];
  /** 최근 30일 일별(구간과 무관하게 고정) */
  daily30: DailyRow[];
  /** 측정 구간 일별 */
  dailyPeriod: DailyRow[];
  visits: VisitSummary;
  matching: EvalReport | null;
  matchingError: string | null;
}

/** 방문 기록이 쌓이기 시작한 운영 배포일 — 그 전 구간은 재방문율 측정 불가 */
export const VISIT_MEASURE_START = "2026-10-11";
/** 운영자 검수가 시작된 날(시범단 시작) — 그 전 7~9월 승인·반려 로그는 개발 중 검수 화면 점검이라 승인율에서 뺀다(대표 2026-10-27, "7월 1일부터 세면 안 된다") */
export const APPROVAL_MEASURE_START = "2026-09-24";
/** 온도 크론 예정 슬롯(15분) — 하루 96회 */
const TEMP_SLOTS_PER_DAY = 96;
/** 팟캐 공개 시각(KST) — 이 전의 오늘은 발행률 분모에서 뺀다(published_at = scheduled_for 09:00) */
const PODCAST_PUBLISH_HOUR = 9;

function kstHourMinute(now: Date): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(now);
  return {
    hour: Number(parts.find((p) => p.type === "hour")?.value) % 24,
    minute: Number(parts.find((p) => p.type === "minute")?.value),
  };
}

const pct = (v: number | null, digits = 1): string => (v == null ? "—" : `${(v * 100).toFixed(digits)}%`);
const verdictOf = (v: number | null, target: number): Verdict => (v == null ? "na" : v >= target ? "pass" : "fail");

export async function buildMetricsReport(sb: SupabaseClient, key: PeriodKey, now: Date = new Date()): Promise<MetricsReport> {
  const period = resolvePeriod(key, now);
  const today = kstToday(now);
  const rangeText = `${period.label} (${shortRange(period.since, period.until)}, ${period.days}일)`;

  // 승인율은 운영 검수 시작일 이후만 — 시범단처럼 그 전부터 시작하는 구간은 시작일을 당긴다
  const approvalSince = period.since < APPROVAL_MEASURE_START ? APPROVAL_MEASURE_START : period.since;
  const approvalUntil = period.until;
  const approvalOverlaps = approvalUntil >= approvalSince; // 구간이 통째로 시작일 앞이면 아무것도 세지 않는다(빈 버킷)
  const [dailyPeriod, daily30, visits, approval] = await Promise.all([
    fetchDaily(sb, period.since, period.until),
    fetchDaily(sb, shiftDate(today, -29), today),
    fetchVisits(sb, period.since, period.until),
    approvalOverlaps ? fetchApproval(sb, approvalSince, approvalUntil) : Promise.resolve(emptyApproval()),
  ]);
  const volumes = await fetchVolumes(sb, period, visits);

  let matching: EvalReport | null = null;
  let matchingError: string | null = null;
  try {
    matching = await evaluatePrecision(sb);
  } catch (e) {
    matchingError = e instanceof Error ? e.message : String(e);
  }

  // ① 매칭 정확도 — 정답셋은 기간과 무관(누적)
  const m: Indicator = {
    no: "①",
    key: "matching",
    title: "크로스뷰 매칭 정확도 Precision@5",
    target: `≥ ${TARGET_PRECISION * 100}%`,
    value: matching && matching.evaluatedMacros > 0 ? matching.meanPrecision : null,
    display: matching && matching.evaluatedMacros > 0 ? pct(matching.meanPrecision) : "—",
    verdict: matching && matching.evaluatedMacros > 0 ? verdictOf(matching.meanPrecision, TARGET_PRECISION) : "na",
    range: "정답셋 누적(구간 무관)",
    note: matchingError
      ? `측정 실패: ${matchingError}`
      : matching && matching.evaluatedMacros > 0
        ? `수동 태깅 정답셋 ${matching.goldsetRows}건 · 평가 대상 광역 기사 ${matching.evaluatedMacros}건. \`pnpm eval:matching\` 과 같은 함수.`
        : "정답셋(matching_eval)이 비어 있어 측정할 수 없습니다.",
    breakdown: [],
  };

  // ② 수집 성공률 — 어댑터 호출 단위
  const aTotal = dailyPeriod.reduce((s, d) => s + d.adaptersTotal, 0);
  const aFailed = dailyPeriod.reduce((s, d) => s + d.adaptersFailed, 0);
  const iRuns = dailyPeriod.reduce((s, d) => s + d.ingestRuns, 0);
  const iOk = dailyPeriod.reduce((s, d) => s + d.ingestOk, 0);
  const ingestRate = aTotal > 0 ? 1 - aFailed / aTotal : null;
  const ingest: Indicator = {
    no: "②",
    key: "ingest",
    title: "API 수집 성공률",
    target: "≥ 95%",
    value: ingestRate,
    display: pct(ingestRate),
    verdict: verdictOf(ingestRate, 0.95),
    range: rangeText,
    note: aTotal > 0 ? `분모 = 어댑터 호출(실행 1회 = ${region.outlets.macro.name}·${region.outlets.micro.name}·유튜브 3종).` : "구간 내 수집 실행 기록(ingest_runs)이 없습니다.",
    breakdown: [
      { label: "실행", display: `${iRuns}회 (성공 ${iOk})` },
      { label: "어댑터 호출", display: `${aTotal}회 (실패 ${aFailed})` },
    ],
  };

  // ③ 온도계 작동률
  const tRuns = dailyPeriod.reduce((s, d) => s + d.tempRuns, 0);
  const tOk = dailyPeriod.reduce((s, d) => s + d.tempOk, 0);
  const tCls = dailyPeriod.reduce((s, d) => s + d.tempClassified, 0);
  const tPend = dailyPeriod.reduce((s, d) => s + d.tempPending, 0);
  const statsRuns = dailyPeriod.reduce((s, d) => s + d.tempStatsRuns, 0);
  const matchedAvg = statsRuns > 0 ? dailyPeriod.reduce((s, d) => s + d.tempMatchedSum, 0) / statsRuns : null;
  const tempRate = tRuns > 0 ? tOk / tRuns : null;
  // 예정 슬롯 대비 실행(미실행 슬롯도 보이게) — 오늘은 지금까지 지난 슬롯만
  const { hour: nowH, minute: nowM } = kstHourMinute(now);
  const expectedSlots = dailyPeriod.reduce((s, d) => s + (d.day === today ? Math.floor((nowH * 60 + nowM) / 15) : TEMP_SLOTS_PER_DAY), 0);
  const temperature: Indicator = {
    no: "③",
    key: "temperature",
    title: "공론 온도계 15분 갱신 작동률",
    target: "≥ 95%",
    value: tempRate,
    display: pct(tempRate),
    verdict: verdictOf(tempRate, 0.95),
    range: rangeText,
    note:
      tRuns > 0
        ? "성공 = temperature_runs.status=ok(기록된 실행 기준 — 지표 정의). 크론이 아예 안 돈 슬롯은 '예정 슬롯 대비' 로 따로 본다. 감정 성분이 0 인 것은 분류 실패가 아니라 이슈에 매칭되는 여론이 거의 없어서(10/11 실측 169사안 중 2사안만 1건) — 매칭 개선은 별도 과제."
        : "구간 내 온도 산출 기록이 없습니다.",
    breakdown: [
      { label: "실행", display: `${tRuns}회 (성공 ${tOk})` },
      { label: "예정 슬롯 대비", display: expectedSlots > 0 ? `${tRuns}/${expectedSlots} (${Math.round((Math.min(tRuns, expectedSlots) / expectedSlots) * 100)}%)` : "—" },
      { label: "감정 분류", display: tPend > 0 ? `${tCls}/${tPend}건` : "기록 없음(10/11 이후 실행부터)" },
      { label: "실행당 여론 매칭", display: matchedAvg == null ? "기록 없음" : `${matchedAvg.toFixed(1)}건` },
    ],
  };

  // ④ 팟캐 발행률 — 구간 내 날짜 중 공개 회차가 있는 날. 오늘은 공개 시각(09시) 전이면 분모에서 뺀다
  const podDays = dailyPeriod.filter((d) => d.day !== today || nowH >= PODCAST_PUBLISH_HOUR);
  const pubDays = podDays.filter((d) => d.podcastPublished).length;
  const reviewDays = podDays.filter((d) => !d.podcastPublished && d.podcastStatus === "review").length;
  const failedDays = podDays.filter((d) => !d.podcastPublished && (d.podcastStatus === "failed" || d.podcastStatus === "generating")).length;
  const noneDays = podDays.filter((d) => !d.podcastPublished && d.podcastStatus == null).length;
  const podRate = podDays.length > 0 ? pubDays / podDays.length : null;
  // 요구사항정의서·사업계획 기준 = 주 3회(월 12건). 운영은 매일 발행이라 그대로 두고(대표 결정 2026-10-25), 지표는
  // "요구 기준 대비 몇 %" 로 적어 초과 달성이 보이게 한다. 매일 기준 발행률은 참고로 아래에 남긴다.
  const planRequired = (podDays.length * 3) / 7;
  const planRatio = planRequired > 0 ? pubDays / planRequired : null;
  const podcast: Indicator = {
    no: "④",
    key: "podcast",
    title: "AI 팟캐스트 정상 발행률",
    target: "≥ 100% (주 3회 · 월 12건)",
    value: planRatio,
    display: planRatio == null ? "—" : `${Math.round(planRatio * 100)}%`,
    verdict: verdictOf(planRatio, 1),
    range: rangeText,
    note: `요구 기준(주 3회×4주 = 12건/월)을 구간 일수로 환산한 편수 대비 실제 공개 회차 비율 — 100% 를 넘으면 초과 달성. 운영은 매일 발행이라 "매일 기준" 발행률(구간 ${podDays.length}일 중 공개된 날, 09시 전의 오늘 제외)을 참고로 함께 둔다. 검수 대기(review)는 생성은 됐으나 확인이 안 끝난 날.`,
    breakdown: [
      { label: "요구 기준 환산", display: `${planRequired.toFixed(1)}편 → 공개 ${pubDays}편` },
      { label: "매일 기준 발행률(참고)", display: `${pct(podRate)} (${pubDays}/${podDays.length}일)` },
      { label: "검수 대기", display: `${reviewDays}일` },
      { label: "생성 실패", display: `${failedDays}일` },
      { label: "회차 없음", display: `${noneDays}일` },
    ],
  };

  // ⑤ 재방문율 — 측정 시작일 이후 구간이 2일 이상이고 방문자가 있어야 수치를 낸다(그 전은 측정 불가)
  const measurableSince = period.since > VISIT_MEASURE_START ? period.since : VISIT_MEASURE_START;
  const measurableDays = period.until >= measurableSince ? daysBetween(measurableSince, period.until) : 0;
  const revisitMeasurable = measurableDays >= 2 && visits.visitors > 0;
  const revisit: Indicator = {
    no: "⑤",
    key: "revisit",
    title: "베타 참여자 재방문율",
    target: "≥ 30%",
    value: revisitMeasurable ? visits.rate : null,
    display: revisitMeasurable && visits.rate != null ? pct(visits.rate) : "—",
    verdict: revisitMeasurable && visits.rate != null ? verdictOf(visits.rate, 0.3) : "na",
    range: rangeText,
    note: !revisitMeasurable
      ? `측정 불가 — 자체 방문 기록은 ${VISIT_MEASURE_START} 운영 배포부터 쌓인다(이 구간의 측정 가능 일수 ${measurableDays}일, 재방문은 2일 이상 필요). 그 전(시범단 기간)은 측정 수단이 가동되지 않아 소급할 수 없다(Cloudflare Web Analytics 는 재방문 지표가 없고 운영에 켜져 있지도 않았음).`
      : "재방문율 = 구간 내 방문일이 2일 이상인 방문자 ÷ 순방문자. 브라우저 무작위 ID 해시 기준(기기·브라우저가 바뀌면 다른 방문자로 센다).",
    breakdown: [
      { label: "순방문자", display: `${visits.visitors}명` },
      { label: "재방문자", display: `${visits.returning}명` },
      { label: "방문일 합", display: `${visits.visitDays}일` },
    ],
  };

  // ⑥ 검수 승인율
  const all = approval.find((a) => a.target === "all")!;
  const approvalInd: Indicator = {
    no: "⑥",
    key: "approval",
    title: "운영자 검수 승인율",
    target: "≥ 85%",
    value: all.rate,
    display: pct(all.rate),
    verdict: verdictOf(all.rate, 0.85),
    range: !approvalOverlaps
      ? `${rangeText} — 운영 검수 시작(${APPROVAL_MEASURE_START}) 전 구간이라 측정 불가`
      : approvalSince === period.since
        ? rangeText
        : `${period.label} 중 운영 검수 시작 이후 (${shortRange(approvalSince, approvalUntil)}, ${daysBetween(approvalSince, approvalUntil)}일)`,
    note: `승인율 = (approve + edit_approve) ÷ (approve + edit_approve + reject). 운영자 검수가 시작된 ${APPROVAL_MEASURE_START}(시범단 시작) 이후만 세고 그 전 개발 중 검수 점검 로그는 뺀다. 한쪽 소속 확인(confirm), 팟캐 검수 마감 자동 공개(auto_publish, 사람 검수 아님), 운영 정리(cleanup — 중복 페어 통합·기사 아닌 클립 제외, 품질 반려 아님)는 분자·분모 모두에서 뺀다. 분모가 0 이면 측정 불가.`,
    breakdown: [
      ...approval
        .filter((a) => a.target !== "all")
        .map((a) => ({ label: { crossview: "크로스뷰", podcast: "팟캐스트", forum: "공론장" }[a.target as "crossview" | "podcast" | "forum"], display: `${pct(a.rate)} (${a.approved}/${a.approved + a.rejected})` })),
      ...(all.autoPublished > 0 ? [{ label: "마감 공개(제외)", display: `${all.autoPublished}편` }] : []),
      ...(all.cleanup > 0 ? [{ label: "운영 정리(제외)", display: `${all.cleanup}건` }] : []),
    ],
  };

  return {
    period,
    generatedAt: now.toISOString(),
    indicators: [m, ingest, temperature, podcast, revisit, approvalInd],
    approval,
    volumes,
    daily30,
    dailyPeriod,
    visits,
    matching,
    matchingError,
  };
}

/** 결과보고서로 옮기기 좋은 CSV (UTF-8 BOM, 구역별 머리줄) */
export function reportToCsv(r: MetricsReport): string {
  const esc = (v: unknown): string => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const line = (cells: unknown[]) => cells.map(esc).join(",");
  const out: string[] = [];
  out.push(line([`${region.site.name} 검증지표`, r.period.label, `${r.period.since}~${r.period.until}`, `생성 ${r.generatedAt}`]));
  out.push("");
  out.push(line(["지표", "제목", "목표", "값", "판정", "측정 구간", "비고"]));
  for (const i of r.indicators) out.push(line([i.no, i.title, i.target, i.display, VERDICT_LABEL[i.verdict], i.range, i.note]));
  out.push("");
  out.push(line(["검수 승인율", "대상", "승인", "반려", "확인(참고)", "마감 공개(제외)", "운영 정리(제외)", "승인율"]));
  for (const a of r.approval) out.push(line(["", a.target, a.approved, a.rejected, a.confirms, a.autoPublished, a.cleanup, a.rate == null ? "" : (a.rate * 100).toFixed(1)]));
  out.push("");
  out.push(line(["실적", "항목", "구간", "비고"]));
  for (const v of r.volumes) out.push(line(["", v.label, v.period ?? "", v.note ?? ""]));
  out.push("");
  out.push(line(["일별(최근 30일)", "날짜", "수집 실행", "수집 성공", "어댑터 호출", "어댑터 실패", "기사 적재", "댓글 적재", "온도 실행", "온도 성공", "감정 분류", "분류 대상", "여론 매칭 평균", "팟캐 상태", "방문자"]));
  for (const d of r.daily30) {
    out.push(line(["", d.day, d.ingestRuns, d.ingestOk, d.adaptersTotal, d.adaptersFailed, d.articlesUpserted, d.commentsUpserted, d.tempRuns, d.tempOk, d.tempClassified, d.tempPending, d.tempMatchedAvg == null ? "" : d.tempMatchedAvg.toFixed(1), d.podcastPublished ? "published" : (d.podcastStatus ?? "none"), d.visitors]));
  }
  return `﻿${out.join("\n")}\n`;
}

export const VERDICT_LABEL: Record<Verdict, string> = { pass: "달성", fail: "미달", na: "측정 불가", manual: "수동 측정" };
