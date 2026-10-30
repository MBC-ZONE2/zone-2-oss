// ============================================================================
// lib/metrics — 검증지표 배럴 (#181). /admin/metrics · /api/admin/metrics · scripts/report/report-stage1 공용.
// ============================================================================

export {
  buildMetricsReport,
  fetchApproval,
  fetchDaily,
  fetchVisits,
  fetchVolumes,
  reportToCsv,
  VERDICT_LABEL,
  type ApprovalSummary,
  type DailyRow,
  type Indicator,
  type MetricsReport,
  type Verdict,
  type VisitSummary,
  type Volume,
} from "./report";
export { evaluatePrecision, TARGET_PRECISION, TOP_K, type EvalReport, type MacroPrecision } from "./matching";
export {
  DEFAULT_PERIOD,
  OCT_RANGE,
  PERIOD_KEYS,
  PERIOD_LABEL,
  PILOT_RANGE,
  isPeriodKey,
  kstToday,
  resolvePeriod,
  shortRange,
  type Period,
  type PeriodKey,
} from "./period";
