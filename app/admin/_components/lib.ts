// ============================================================================
// app/admin/_components/lib — 관리자 대시보드 공용 유틸 (클라이언트)
//
// 검수 큐 / 콘텐츠 관리 / 감사 로그 패널이 공유하는 타입·포맷·API 헬퍼.
// 금칙어 하이라이트는 lib/moderation 의 checkBannedWords 를 재사용한다.
// ============================================================================

import {
  BANNED_WORDS,
  checkBannedWords,
} from "@/lib/moderation/banned-words";
import {
  CONFIRM_ORGS,
  ORG_LABEL,
  REQUIRED_CONFIRMATIONS,
  type AdminOrg,
  type AdminRole,
} from "@/lib/auth/roles";

// ---------------------------------------------------------------------------
// 공용 타입
// ---------------------------------------------------------------------------

export type QueueTarget = "crossview" | "podcast" | "forum";

/** 소속별 확인 시각(미확인이면 null) — 서버 confirmSummary 미러 */
export type ConfirmMap = Record<AdminOrg, string | null>;

/** 큐를 보는 사람 — 서버 QueueViewer 미러 */
export interface QueueViewer {
  role: AdminRole;
  org: AdminOrg | null;
  canConfirmBoth: boolean;
  canModerate: boolean;
}

/** 표준 API 응답 */
export type ApiResult<T> =
  | { data: T; error: null }
  | { data: null; error: { code: string; message: string } };

/** 검수 큐 항목 (서버 QueueItem 미러) */
export interface QueueItem {
  id: string;
  target: QueueTarget;
  title: string;
  preview: string | null;
  meta: Record<string, unknown>;
  detail: Record<string, unknown>;
  createdAt: string;
}

/** 콘텐츠 이력 항목 (서버 ContentItem 미러) */
export interface ContentItem {
  id: string;
  target: "crossview" | "podcast";
  title: string;
  status: "published" | "rejected";
  processedAt: string;
  createdAt: string;
  canRollback: boolean;
}

/** 감사 로그 항목 (서버 ModerationLog 미러) */
export interface LogItem {
  id: string;
  target: string;
  targetId: string;
  action: string;
  reason: string | null;
  details: Record<string, unknown> | null;
  operator: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// 이중 컨펌 (회의 결정 [9]) — 옥천신문·MBC충북 양측 확인
// ---------------------------------------------------------------------------

export { CONFIRM_ORGS, ORG_LABEL, REQUIRED_CONFIRMATIONS };
export type { AdminOrg };

/** 공론장은 이중 컨펌 대상이 아니다(댓글·게시물 모더레이션은 단일). */
export function isDualTarget(target: QueueTarget): boolean {
  return target === "crossview" || target === "podcast";
}

/** meta.confirmations 를 안전하게 읽는다 — 값이 없으면 전부 미확인으로 본다. */
export function readConfirmations(item: QueueItem): ConfirmMap {
  const raw = item.meta.confirmations;
  const map = (raw ?? {}) as Record<string, unknown>;
  return {
    okinews: typeof map.okinews === "string" ? map.okinews : null,
    mbc: typeof map.mbc === "string" ? map.mbc : null,
  };
}

/**
 * 이 사람이 그 소속으로 확인할 수 있는지.
 * super_admin 은 양쪽 모두, 기자는 자기 소속만. 소속이 없으면 확인 불가.
 */
export function canConfirmAs(viewer: QueueViewer | null, org: AdminOrg): boolean {
  if (!viewer || !viewer.canModerate) return false;
  if (viewer.canConfirmBoth) return true;
  return viewer.org === org;
}

/** 확인 버튼이 비활성일 때 보여줄 안내 */
export function confirmBlockReason(viewer: QueueViewer | null, org: AdminOrg): string {
  if (!viewer) return "";
  if (!viewer.canModerate) return "이 대상을 검수할 권한이 없습니다.";
  if (!viewer.canConfirmBoth && !viewer.org) {
    return `소속을 지정해 주세요 — 계정·권한 관리에서 ${ORG_LABEL.okinews}/${ORG_LABEL.mbc}을 지정해야 확인할 수 있습니다.`;
  }
  return `${ORG_LABEL[org]} 담당자만 확인할 수 있습니다.`;
}

// ---------------------------------------------------------------------------
// 라벨
// ---------------------------------------------------------------------------

export const TARGET_LABEL: Record<string, string> = {
  crossview: "크로스뷰",
  podcast: "팟캐스트",
  forum: "공론장",
  temperature: "온도계",
};

export const ACTION_LABEL: Record<string, string> = {
  approve: "승인",
  reject: "반려",
  edit_approve: "수정승인",
  auto_publish: "마감 공개", // 팟캐 검수 마감 자동 공개 — 사람 승인 아님(#185)
  cleanup: "운영 정리", // 중복 페어 통합·기사 아닌 클립 제외 — 품질 반려 아님(#189, 0026)
};

export const FLAG_LABEL: Record<string, string> = {
  bot: "봇 의심",
  spam: "스팸",
  hate: "혐오/욕설",
  report: "신고 누적",
};

/** 입력/텍스트영역 공통 스타일 — app/admin.css .ad-field(1px 잉크 괘선, 라운드 0, 17px) */
export const FIELD_CLASS = "ad-field";

// ---------------------------------------------------------------------------
// API 헬퍼
// ---------------------------------------------------------------------------

/** 표준 응답 래퍼 — 네트워크/HTTP 오류를 error 로 정규화한다. */
export async function apiFetch<T>(
  url: string,
  init?: RequestInit,
): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, { cache: "no-store", ...init });
    const json = (await res.json()) as ApiResult<T>;
    if (!res.ok || json.error) {
      return {
        data: null,
        error: json.error ?? { code: "HTTP", message: "요청에 실패했습니다." },
      };
    }
    return json;
  } catch {
    return {
      data: null,
      error: { code: "NETWORK", message: "네트워크 오류가 발생했습니다." },
    };
  }
}

// ---------------------------------------------------------------------------
// 날짜 / SLA
// ---------------------------------------------------------------------------

/** 검수 SLA 임계 (시간) — 초과 시 위험 색 강조 (표시만, 상태 전이 없음) */
export const SLA_HOURS = 4;

/** ISO → "MM.DD HH:mm" 로컬 표기 */
export function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ko-KR", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** 경과 시간을 사람이 읽는 문자열로 */
function formatElapsed(ms: number): string {
  if (ms < 60_000) return "방금";
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}분`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  if (hours < 24) return rem > 0 ? `${hours}시간 ${rem}분` : `${hours}시간`;
  const days = Math.floor(hours / 24);
  return `${days}일 ${hours % 24}시간`;
}

/** 대기 경과 정보 — SLA 초과 여부 포함 */
export function elapsedInfo(createdAt: string): {
  label: string;
  danger: boolean;
  ms: number;
} {
  const then = new Date(createdAt).getTime();
  if (Number.isNaN(then)) return { label: "-", danger: false, ms: 0 };
  const ms = Math.max(0, Date.now() - then);
  return { label: `${formatElapsed(ms)} 대기`, danger: ms >= SLA_HOURS * 3_600_000, ms };
}

// ---------------------------------------------------------------------------
// 금칙어 하이라이트 (lib/moderation checkBannedWords 재사용)
// ---------------------------------------------------------------------------

/** 정규식 특수문자 이스케이프 */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 사전 단어의 리터럴 매칭용 정규식 (모듈 1회 생성) */
const BANNED_REGEX: RegExp | null = (() => {
  const tokens = BANNED_WORDS.map((w) => escapeRegExp(w.word)).filter(Boolean);
  return tokens.length ? new RegExp(`(${tokens.join("|")})`, "gi") : null;
})();

/** 텍스트에 금칙어(정규화 매칭)가 존재하는지 — 일괄 자동제외/경고 판정용 */
export function hasBannedHit(text: string | null | undefined): boolean {
  if (!text) return false;
  return checkBannedWords(text).matched;
}

/** 하이라이트 세그먼트 */
export interface Segment {
  text: string;
  banned: boolean;
}

/** 텍스트를 금칙어 리터럴 매칭 기준으로 세그먼트 분할한다. */
export function highlightBanned(text: string): Segment[] {
  if (!BANNED_REGEX) return [{ text, banned: false }];
  const segs: Segment[] = [];
  let last = 0;
  for (const m of text.matchAll(BANNED_REGEX)) {
    const i = m.index ?? 0;
    if (i > last) segs.push({ text: text.slice(last, i), banned: false });
    segs.push({ text: m[0], banned: true });
    last = i + m[0].length;
  }
  if (last < text.length) segs.push({ text: text.slice(last), banned: false });
  return segs.length ? segs : [{ text, banned: false }];
}

// ---------------------------------------------------------------------------
// detail 안전 추출
// ---------------------------------------------------------------------------

/** detail 레코드에서 문자열 안전 추출 */
export function detailStr(
  detail: Record<string, unknown>,
  key: string,
): string | null {
  const v = detail[key];
  return typeof v === "string" ? v : null;
}

/** detail 레코드에서 숫자 안전 추출 */
export function detailNum(
  detail: Record<string, unknown>,
  key: string,
): number | null {
  const v = detail[key];
  return typeof v === "number" ? v : null;
}
