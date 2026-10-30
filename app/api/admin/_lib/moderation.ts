// ============================================================================
// app/api/admin/_lib/moderation — 검수 대상별 매핑 (queue + moderate 공용)
//
// 출처: docs/04-데이터모델.md (테이블·status enum), deliverables/05-검수-프로세스.md
//
// "대상(target) → 테이블 / 검수대기 조건 / 승인·반려·수정승인 시 갱신값" 을 한 곳에.
// queue / moderate / bulk 라우트가 이 매핑을 공유해 일관성을 유지한다.
//
// 이중 컨펌(회의 결정 [9]): 크로스뷰·팟캐스트는 옥천신문·MBC충북 **양측 확인이
// 모두 끝나야** 발행된다. 한쪽만 확인되면 status 는 candidate/review 그대로 두고
// confirmations jsonb 에만 기록한다 (0017_dual_confirm).
// 확인 기록 병합은 DB 함수 confirm_content(0019)가 원자적으로 처리하고, 그 전
// 단계는 감사 로그에 action='confirm'(기관 확인)으로 남긴다.
//
// ⚠️ app/api/admin/_lib 은 폴더명이 _ 로 시작하므로 Next.js 라우트로 노출되지
//    않는 내부 모듈이다(담당 경로 app/api/admin/** 내부).
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ModerationAction } from "@/types";
import { orgLabel } from "@/config/region";
import {
  CONFIRM_ORGS,
  REQUIRED_CONFIRMATIONS,
  isAdminOrg,
  type AdminOrg,
  type AdminRole,
  type DualConfirmTarget,
} from "@/lib/auth/roles";

/** queue/moderate 가 다루는 대상 (temperature 는 status 가 없어 별도 처리) */
export type QueueTarget = "crossview" | "podcast" | "forum";

/** moderate 가 다루는 전체 대상 (moderation_logs.target enum 과 동일) */
export type ModerateTarget = QueueTarget | "temperature";

/** 수정승인(edit_approve) 가능 대상 — 인라인 편집 필드가 있는 유형만 */
export type EditableTarget = "crossview" | "podcast";

/**
 * 검수 전이의 전제 상태 — "큐에 있는" 행만 전이를 허용한다(교차리뷰 반영).
 * 이 가드가 없으면 이미 published/rejected 인 행도 id 만으로 재전이 가능.
 */
export const QUEUE_STATE_GUARD: Record<
  ModerateTarget,
  { column: string; value: string | boolean } | null
> = {
  crossview: { column: "status", value: "candidate" },
  podcast: { column: "status", value: "review" },
  forum: { column: "is_flagged", value: true },
  temperature: null, // status 없음 — 로그만
};

/** 검수 대기 목록의 한 행 (UI 표시에 필요한 최소 필드) */
export interface QueueItem {
  id: string;
  target: QueueTarget;
  title: string;
  /** 미리보기용 본문 일부 (요약/스크립트/게시글 본문) */
  preview: string | null;
  /** 부가 메타 (출처·점수·플래그 사유 등) */
  meta: Record<string, unknown>;
  /** 카드 펼침용 전체 상세 (요약 원문·대본 전문·본문·양측 기사 제목 등) */
  detail: Record<string, unknown>;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// 상태 갱신값 빌더 (approve / reject / edit_approve 공용)
// ---------------------------------------------------------------------------

/**
 * 대상별 status 갱신값 빌더.
 * approve/edit_approve → 게시 상태, reject → 반려 상태로 매핑한다.
 * operatorId 는 검수자 기록용(podcast.reviewed_by 등).
 */
function buildUpdate(
  target: ModerateTarget,
  action: ModerationAction,
  operatorId: string,
  scheduledFor?: string | null,
): { table: string; values: Record<string, unknown> } | null {
  const nowIso = new Date().toISOString();
  // 승인/수정승인은 게시, reject 만 반려. (edit_approve 를 승인으로 취급)
  const isApprove = action !== "reject";

  switch (target) {
    case "crossview":
      // 반려 시 confirmations 를 비운다 — 나중에 롤백돼 큐로 돌아와도
      // 옛 확인 기록으로 한쪽 클릭만에 발행되지 않게 한다(회의 결정 [9]).
      return {
        table: "crossview_pairs",
        values: isApprove
          ? { status: "approved" }
          : { status: "rejected", confirmations: {} },
      };
    case "podcast":
      // 팟캐 published_at 은 "승인 시각"이 아니라 에피소드의 **콘텐츠 날짜
      // (scheduled_for)**로 박는다. 제목("오늘의 충북 M월 D일")·정렬·발행일이
      // 모두 콘텐츠 날짜로 일치한다. 검수가 다음날로 밀려도 제목이 발행일보다
      // 하루 빨라 보이던 off-by-one(#107/#109)을 없앤다. scheduled_for 는
      // date(YYYY-MM-DD)이므로 KST 오전 발행 시각으로 확정한다. 없으면 now 폴백.
      return {
        table: "podcast_episodes",
        values: isApprove
          ? {
              status: "published",
              published_at: scheduledFor
                ? `${scheduledFor}T09:00:00+09:00`
                : nowIso,
              reviewed_by: operatorId,
            }
          : // 반려 시 confirmations 초기화 (크로스뷰와 동일한 이유)
            { status: "failed", reviewed_by: operatorId, confirmations: {} },
      };
    case "forum":
      // 승인 = 플래그 해제(게시), 반려 = 플래그 유지(숨김).
      return {
        table: "forum_posts",
        values: isApprove
          ? { is_flagged: false, flag_reason: null }
          : { is_flagged: true },
      };
    case "temperature":
      // 온도계는 자동 게시 + 사후 보정 정책. status 컬럼 없음 → 로그만.
      return null;
  }
}

/** moderate: 대상 행 갱신값을 반환한다. null 이면 상태 갱신 없이 로그만 기록. */
export function getModerationUpdate(
  target: ModerateTarget,
  action: ModerationAction,
  operatorId: string,
  scheduledFor?: string | null,
): { table: string; values: Record<string, unknown> } | null {
  return buildUpdate(target, action, operatorId, scheduledFor);
}

// ---------------------------------------------------------------------------
// 수정승인(edit_approve) — 인라인 편집 필드 화이트리스트 + 스냅샷/갱신값
// ---------------------------------------------------------------------------

/** 대상별 편집 허용 컬럼 (before/after 스냅샷 및 update 화이트리스트) */
export const EDITABLE_FIELDS: Record<EditableTarget, readonly string[]> = {
  crossview: ["summary_macro", "summary_micro", "reading_point"],
  podcast: ["title", "script"],
};

/** before 스냅샷 조회용 select (편집 대상 컬럼 + id) */
export function editableSelect(target: EditableTarget): string {
  return ["id", ...EDITABLE_FIELDS[target]].join(", ");
}

/** 편집 대상 여부 판별 */
export function isEditableTarget(target: string): target is EditableTarget {
  return target === "crossview" || target === "podcast";
}

/**
 * 수정승인 갱신값 — 승인 상태 전이값에 화이트리스트 편집값을 병합한다.
 * edits 는 EDITABLE_FIELDS 로 필터링된 안전한 컬럼만 담고 있어야 한다.
 */
export function getEditApproveUpdate(
  target: EditableTarget,
  edits: Record<string, string>,
  operatorId: string,
): { table: string; values: Record<string, unknown> } {
  const base = buildUpdate(target, "approve", operatorId);
  // EditableTarget(crossview/podcast) 은 buildUpdate 가 항상 값을 반환한다.
  const values: Record<string, unknown> = { ...base!.values, ...edits };
  // 팟캐 대본을 고쳤으면 옛 대본으로 지은 헤드라인은 무효 — 비워 두면 화면은 휴리스틱으로
  // 폴백하고 팟캐 크론(매시)이 새 대본으로 다시 짓는다(codex 를 여기서 기다리지 않는다).
  if (target === "podcast" && typeof edits.script === "string") values.headline = null;
  return { table: base!.table, values };
}

/** 편집 입력을 화이트리스트 컬럼으로만 좁혀 반환 (문자열 값만 허용) */
export function pickEditableFields(
  target: EditableTarget,
  input: Record<string, unknown>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of EDITABLE_FIELDS[target]) {
    const v = input[key];
    if (typeof v === "string") out[key] = v;
  }
  return out;
}

// ---------------------------------------------------------------------------
// 이중 컨펌 — 옥천신문·MBC충북 양측 확인 (회의 결정 [9], 0017_dual_confirm)
// ---------------------------------------------------------------------------

/** confirmations 한 칸 — 누가(by) 언제(at) 확인했는지 */
export interface ConfirmEntry {
  by: string | null;
  at: string;
}

/** 확인 현황 — API 응답·UI 배지에 그대로 쓰는 형태 */
export interface ConfirmState {
  /** 확인이 끝난 소속 */
  confirmed: AdminOrg[];
  /** 아직 확인이 남은 소속 */
  pending: AdminOrg[];
  /** 필요한 확인 수(REQUIRED_CONFIRMATIONS)를 채움 → 발행 전이. 2026-10-29 부터 1 이라 첫 확인에 바로 true */
  complete: boolean;
}

/** 이중 컨펌 대상 → confirmations 컬럼이 있는 테이블 */
export const DUAL_CONFIRM_TABLE: Record<DualConfirmTarget, string> = {
  crossview: "crossview_pairs",
  podcast: "podcast_episodes",
};

/** jsonb 를 안전한 {소속: ConfirmEntry} 로 정규화한다(형식 이상 값은 버린다). */
export function parseConfirmations(
  value: unknown,
): Partial<Record<AdminOrg, ConfirmEntry>> {
  const out: Partial<Record<AdminOrg, ConfirmEntry>> = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return out;
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!isAdminOrg(key) || !raw || typeof raw !== "object") continue;
    const entry = raw as Record<string, unknown>;
    const at = typeof entry.at === "string" ? entry.at : null;
    if (!at) continue;
    out[key] = { by: typeof entry.by === "string" ? entry.by : null, at };
  }
  return out;
}

/** 확인 맵 → 확인/미확인 목록 (키가 있으면 확인된 것으로 본다). complete 는 확인 수 ≥ REQUIRED_CONFIRMATIONS */
export function confirmState(map: Record<string, unknown>): ConfirmState {
  const confirmed = CONFIRM_ORGS.filter((org) => Boolean(map[org]));
  const pending = CONFIRM_ORGS.filter((org) => !map[org]);
  return {
    confirmed: [...confirmed],
    pending: [...pending],
    complete: confirmed.length >= REQUIRED_CONFIRMATIONS,
  };
}

/** 큐 목록에 내려줄 축약형 — 소속별 확인 시각(미확인이면 null) */
export function confirmSummary(value: unknown): Record<AdminOrg, string | null> {
  const map = parseConfirmations(value);
  return { okinews: map.okinews?.at ?? null, mbc: map.mbc?.at ?? null };
}

/**
 * 요청자가 어떤 소속으로 확인하는지 결정한다.
 *   - super_admin: 소속이 없으므로 요청에서 org 를 필수로 받는다(양쪽 대행 가능).
 *   - 그 외 관리자: 자신의 소속으로만 확인할 수 있다.
 *   - 소속이 없는 관리자(마이그레이션 전 계정 중 super_admin/viewer 가 아닌 경우)는
 *     확인할 수 없고, 계정·권한 관리에서 소속을 먼저 지정해야 한다.
 */
export function resolveConfirmOrg(
  operator: { role: AdminRole; org: AdminOrg | null },
  requestedOrg?: AdminOrg,
): { org: AdminOrg; error?: undefined } | { org?: undefined; error: { code: string; message: string } } {
  if (operator.role === "super_admin") {
    if (!requestedOrg) {
      return {
        error: {
          code: "ORG_REQUIRED",
          message: `확인 주체(${orgLabel("okinews")}/${orgLabel("mbc")})를 선택해 주세요.`,
        },
      };
    }
    return { org: requestedOrg };
  }
  if (!operator.org) {
    return {
      error: {
        code: "ORG_REQUIRED",
        message: "소속이 지정되지 않은 계정입니다. 계정·권한 관리에서 소속을 지정해 주세요.",
      },
    };
  }
  if (requestedOrg && requestedOrg !== operator.org) {
    return {
      error: {
        code: "ORG_MISMATCH",
        message: "다른 소속을 대신 확인할 수 없습니다.",
      },
    };
  }
  return { org: operator.org };
}

/** 감사 로그 액션 — 이중 컨펌의 "한쪽 확인" 단계를 승인과 구분한다(0019). */
export type ModerationLogAction = ModerationAction | "confirm";

/**
 * 감사 로그에 남길 액션을 고른다.
 * 양측 확인이 끝나 실제 발행으로 전이될 때만 approve/edit_approve 로 남기고,
 * 아직 한쪽만 확인된 단계는 'confirm'(기관 확인)으로 남긴다. 미발행 후보가
 * 승인율(approve/(approve+reject)) 집계에 섞이지 않게 하기 위한 구분이다.
 */
export function logActionFor(
  action: ModerationAction,
  confirm: ConfirmState | null,
): ModerationLogAction {
  return confirm && !confirm.complete ? "confirm" : action;
}

/** planDualConfirm 결과 — 실패(error)거나, 병합된 confirmations + 현황 */
export type ConfirmPlan =
  | { kind: "error"; code: string; message: string }
  | {
      kind: "confirm";
      state: ConfirmState;
      confirmations: Record<string, ConfirmEntry>;
      /**
       * RPC 호출 **직전**의 확인 기록. 감사 로그 기록에 실패했을 때
       * 확인 기록을 되돌리는 보정 쓰기에만 쓴다(병합에는 쓰지 않는다).
       */
      previous: Record<string, ConfirmEntry>;
    };

/** 확인 맵을 CONFIRM_ORGS 키만 남긴 안전한 형태로 좁힌다 */
function pickConfirmEntries(value: unknown): Record<string, ConfirmEntry> {
  const map = parseConfirmations(value);
  const out: Record<string, ConfirmEntry> = {};
  for (const key of CONFIRM_ORGS) {
    const entry = map[key];
    if (entry) out[key] = entry;
  }
  return out;
}

/**
 * 대상 행에 "내 소속 확인"을 기록하고, 병합된 확인 현황을 돌려준다.
 *   - 병합은 DB 함수 confirm_content(0019)가 **한 UPDATE 문 안에서** 수행한다.
 *     앱에서 읽고 병합해 다시 쓰면 양측이 동시에 확인할 때 나중 쓰기가 상대의
 *     확인을 지운다(lost update). 그래서 호출부는 confirmations 를 **다시 쓰지
 *     않고** 여기서 돌아온 값을 그대로 판정에만 쓴다.
 *   - 같은 소속의 재확인은 시각·확인자만 갱신한다(중복 확인 아님).
 *   - resetOthers=true(내용이 실제로 바뀐 수정승인)면 상대 소속의 확인을 지운다.
 *     상대가 보지 못한 내용이 그대로 발행되는 것을 막기 위한 규칙이다.
 *   - RPC 는 검수 큐 상태(candidate/review)의 행만 갱신한다. 큐 밖이면 null →
 *     NOT_IN_QUEUE 로 돌려준다(이미 처리된 대상에 확인만 남는 것을 막는다).
 */
export async function planDualConfirm(
  supabase: SupabaseClient,
  target: DualConfirmTarget,
  targetId: string,
  org: AdminOrg,
  operatorId: string,
  resetOthers = false,
): Promise<ConfirmPlan> {
  // 원복용 사전 스냅샷 — 병합에는 쓰지 않으므로 경합에 영향을 주지 않는다.
  const { data: before } = await supabase
    .from(DUAL_CONFIRM_TABLE[target])
    .select("confirmations")
    .eq("id", targetId)
    .maybeSingle();

  const { data, error } = await supabase.rpc("confirm_content", {
    p_table: DUAL_CONFIRM_TABLE[target],
    p_id: targetId,
    p_org: org,
    p_by: operatorId,
    p_reset_others: resetOthers,
  });
  if (error) {
    console.error("planDualConfirm: confirm_content RPC 실패:", error);
    return {
      kind: "error",
      code: "CONFIRM_WRITE_FAILED",
      message: "확인 상태를 기록하지 못했습니다.",
    };
  }
  if (!data) {
    // 행이 없거나 이미 발행/반려되어 큐를 떠난 상태.
    return {
      kind: "error",
      code: "NOT_IN_QUEUE",
      message: "대상이 없거나 이미 처리되었습니다.",
    };
  }

  const merged = pickConfirmEntries(data);
  return {
    kind: "confirm",
    state: confirmState(merged),
    confirmations: merged,
    previous: pickConfirmEntries(
      (before as Record<string, unknown> | null)?.confirmations,
    ),
  };
}

// ---------------------------------------------------------------------------
// queue 조회 설정 (대상별 테이블 / 필터 / 매퍼)
// ---------------------------------------------------------------------------

/**
 * queue: 대상별 "검수 대기" 행을 조회하는 설정.
 * table/select/정렬과, 조회 후 QueueItem 으로 매핑하는 함수를 제공한다.
 */
export interface QueueConfig {
  table: string;
  select: string;
  filterColumn: string;
  filterValue: string | boolean;
  toItem: (row: Record<string, unknown>) => QueueItem;
}

/** 문자열 안전 추출 */
function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

/** 본문을 미리보기 길이로 자른다 */
function clip(v: unknown, len = 160): string | null {
  const s = str(v);
  if (!s) return null;
  return s.length > len ? `${s.slice(0, len)}…` : s;
}

export const QUEUE_CONFIG: Record<QueueTarget, QueueConfig> = {
  crossview: {
    table: "crossview_pairs",
    select:
      "id, article_macro, article_micro, summary_macro, summary_micro, reading_point, similarity, match_score, status, confirmations, created_at",
    filterColumn: "status",
    filterValue: "candidate",
    toItem: (row) => ({
      id: String(row.id),
      target: "crossview",
      title: str(row.reading_point) ?? "크로스뷰 매칭 후보",
      preview: clip(row.summary_macro) ?? clip(row.summary_micro),
      meta: {
        similarity: row.similarity ?? null,
        matchScore: row.match_score ?? null,
        // 이중 컨펌 현황 — 카드 배지("옥천신문 ✓ / MBC충북 –")용
        confirmations: confirmSummary(row.confirmations),
      },
      detail: {
        macroId: str(row.article_macro),
        microId: str(row.article_micro),
        summaryMacro: str(row.summary_macro),
        summaryMicro: str(row.summary_micro),
        readingPoint: str(row.reading_point),
        // 양측 기사 제목은 enrichQueueItems 에서 채운다.
        macroTitle: null,
        microTitle: null,
      },
      createdAt: String(row.created_at),
    }),
  },
  podcast: {
    table: "podcast_episodes",
    select:
      "id, title, headline, script, duration_sec, scheduled_for, status, confirmations, created_at",
    filterColumn: "status",
    filterValue: "review",
    toItem: (row) => ({
      id: String(row.id),
      target: "podcast",
      // 큐 제목 = "날짜 제목 — 헤드라인" (헤드라인이 있으면). 검수자가 회차 내용을 바로 본다
      title: str(row.headline)
        ? `${str(row.title) ?? "팟캐스트 에피소드"} — ${str(row.headline)}`
        : (str(row.title) ?? "팟캐스트 에피소드"),
      preview: clip(row.script),
      meta: {
        durationSec: row.duration_sec ?? null,
        scheduledFor: row.scheduled_for ?? null,
        // 이중 컨펌 현황 — 카드 배지("옥천신문 ✓ / MBC충북 –")용
        confirmations: confirmSummary(row.confirmations),
      },
      detail: {
        title: str(row.title),
        script: str(row.script),
        scheduledFor: str(row.scheduled_for),
        durationSec:
          typeof row.duration_sec === "number" ? row.duration_sec : null,
      },
      createdAt: String(row.created_at),
    }),
  },
  forum: {
    table: "forum_posts",
    select: "id, title, body, flag_reason, like_count, is_flagged, created_at",
    filterColumn: "is_flagged",
    filterValue: true,
    toItem: (row) => ({
      id: String(row.id),
      target: "forum",
      // 사안 댓글은 제목이 없다 — 큐 제목은 본문 앞머리로(검수자가 무슨 글인지 바로 보게)
      title: str(row.title) ?? clip(row.body, 60) ?? "(내용 없음)",
      preview: clip(row.body),
      meta: {
        flagReason: row.flag_reason ?? null,
        likeCount: row.like_count ?? 0,
      },
      detail: {
        body: str(row.body),
        flagReason: str(row.flag_reason),
        likeCount: typeof row.like_count === "number" ? row.like_count : 0,
        // 신고 수는 enrichQueueItems 에서 채운다.
        reportCount: 0,
      },
      createdAt: String(row.created_at),
    }),
  },
};

// ---------------------------------------------------------------------------
// 상세 보강 — 조인 없이 2차 조회로 병합(임베드 관계 힌트 취약성 회피)
// ---------------------------------------------------------------------------

/** 행 배열을 안전한 Record 배열로 변환 (스키마 미지정 캐스팅) */
function asRows(data: unknown): Record<string, unknown>[] {
  return (data ?? []) as unknown as Record<string, unknown>[];
}

/** 크로스뷰: 양측 기사 제목/URL 을 articles 에서 조회해 detail 에 병합 */
async function attachArticleTitles(
  supabase: SupabaseClient,
  items: QueueItem[],
): Promise<void> {
  const ids = new Set<string>();
  for (const it of items) {
    const m = it.detail.macroId;
    const mi = it.detail.microId;
    if (typeof m === "string") ids.add(m);
    if (typeof mi === "string") ids.add(mi);
  }
  if (ids.size === 0) return;

  const { data } = await supabase
    .from("articles")
    .select("id, title, url")
    .in("id", [...ids]);

  const map = new Map<string, { title: string | null; url: string | null }>();
  for (const r of asRows(data)) {
    map.set(String(r.id), { title: str(r.title), url: str(r.url) });
  }
  for (const it of items) {
    const m = map.get(String(it.detail.macroId ?? ""));
    const mi = map.get(String(it.detail.microId ?? ""));
    it.detail.macroTitle = m?.title ?? null;
    it.detail.macroUrl = m?.url ?? null;
    it.detail.microTitle = mi?.title ?? null;
    it.detail.microUrl = mi?.url ?? null;
  }
}

/** 공론장: 게시글별 신고 수를 forum_reports 에서 집계해 detail 에 병합 */
async function attachReportCounts(
  supabase: SupabaseClient,
  items: QueueItem[],
): Promise<void> {
  const ids = items.map((it) => it.id);
  const { data } = await supabase
    .from("forum_reports")
    .select("target_id")
    .eq("target", "post")
    .in("target_id", ids);

  const counts = new Map<string, number>();
  for (const r of asRows(data)) {
    const k = String(r.target_id);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  for (const it of items) it.detail.reportCount = counts.get(it.id) ?? 0;
}

/** 대상별 상세 보강 진입점 (조회 실패는 흡수 — 목록은 그대로 노출) */
export async function enrichQueueItems(
  supabase: SupabaseClient,
  target: QueueTarget,
  items: QueueItem[],
): Promise<void> {
  if (items.length === 0) return;
  try {
    if (target === "crossview") await attachArticleTitles(supabase, items);
    else if (target === "forum") await attachReportCounts(supabase, items);
  } catch (error) {
    // 보강 실패는 치명적이지 않다 — 상세 일부만 비고 목록은 정상 표시.
    console.error("enrichQueueItems 보강 실패:", error);
  }
}
