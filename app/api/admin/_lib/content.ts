// ============================================================================
// app/api/admin/_lib/content — 콘텐츠 관리(발행/반려 이력 + 롤백) 매핑
//
// 출처: REQ(F7) — 관리자 대시보드 콘텐츠 관리 탭 (이슈 #34)
//
// AI 생성 콘텐츠(크로스뷰·팟캐스트)의 처리 이력을 조회하고, 발행된 항목을
// 검수 상태로 되돌리는(롤백) 매핑을 한 곳에 모은다. 공론장 UGC 는 검수 큐에서
// 다루므로 콘텐츠 관리 대상에서 제외한다(Editor 페르소나 범위).
//
// 롤백 전이(대상별 "발행 → 검수"):
//   - 팟캐스트: published → review        (스펙 명시)
//   - 크로스뷰: approved  → candidate     (approved=공개, candidate=검수대기 대응)
// ============================================================================

/** 콘텐츠 관리 대상 (발행/검수 상태를 갖는 AI 생성물) */
export type ContentTarget = "crossview" | "podcast";

/** 정규화 상태 — 발행됨 / 반려됨 (UI 뱃지 공용) */
export type ContentStatus = "published" | "rejected";

/** 콘텐츠 이력 한 행 */
export interface ContentItem {
  id: string;
  target: ContentTarget;
  title: string;
  status: ContentStatus;
  /** 발행 시각(있으면) 또는 생성 시각 — "처리 일시" 표시용 ISO */
  processedAt: string;
  createdAt: string;
  /** 발행 상태여서 롤백(검수 되돌리기) 가능한지 */
  canRollback: boolean;
}

/** 대상별 콘텐츠 조회/전이 설정 */
export interface ContentConfig {
  table: string;
  select: string;
  statusColumn: string;
  /** 제목 검색 대상 컬럼 (ilike) */
  searchColumn: string;
  /** DB 상태값 → 정규화 상태 (발행됨/반려됨) */
  publishedValue: string;
  rejectedValue: string;
  /** 이력 대상 상태값 목록 (published/rejected 조회 범위) */
  statusValues: readonly string[];
  toItem: (row: Record<string, unknown>) => ContentItem;
  /** 롤백 시 갱신값 (발행 → 검수 되돌리기) */
  rollbackValues: Record<string, unknown>;
  /** 롤백 전이 라벨 (감사로그 details 기록용) */
  rollbackFrom: string;
  rollbackTo: string;
}

function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

export const CONTENT_CONFIG: Record<ContentTarget, ContentConfig> = {
  crossview: {
    table: "crossview_pairs",
    select: "id, reading_point, summary_macro, status, created_at",
    statusColumn: "status",
    searchColumn: "reading_point",
    publishedValue: "approved",
    rejectedValue: "rejected",
    statusValues: ["approved", "rejected"],
    toItem: (row) => {
      const published = str(row.status) === "approved";
      const created = String(row.created_at);
      return {
        id: String(row.id),
        target: "crossview",
        title:
          str(row.reading_point) ??
          str(row.summary_macro)?.slice(0, 60) ??
          "크로스뷰 카드",
        status: published ? "published" : "rejected",
        processedAt: created,
        createdAt: created,
        canRollback: published,
      };
    },
    // 이중 컨펌 초기화 — 되돌린 항목은 양측이 다시 확인해야 발행된다(회의 결정 [9]).
    rollbackValues: { status: "candidate", confirmations: {} },
    rollbackFrom: "approved",
    rollbackTo: "candidate",
  },
  podcast: {
    table: "podcast_episodes",
    select: "id, title, status, published_at, created_at",
    statusColumn: "status",
    searchColumn: "title",
    publishedValue: "published",
    rejectedValue: "failed",
    statusValues: ["published", "failed"],
    toItem: (row) => {
      const published = str(row.status) === "published";
      const created = String(row.created_at);
      return {
        id: String(row.id),
        target: "podcast",
        title: str(row.title) ?? "팟캐스트 에피소드",
        status: published ? "published" : "rejected",
        processedAt: str(row.published_at) ?? created,
        createdAt: created,
        canRollback: published,
      };
    },
    // 발행 → 검수 되돌리기: 상태 review + 발행시각 해제.
    // 이중 컨펌 초기화 — 되돌린 항목은 양측이 다시 확인해야 발행된다(회의 결정 [9]).
    rollbackValues: { status: "review", published_at: null, confirmations: {} },
    rollbackFrom: "published",
    rollbackTo: "review",
  },
};

/** 문자열이 유효한 ContentTarget 인지 판별 */
export function isContentTarget(v: string): v is ContentTarget {
  return v === "crossview" || v === "podcast";
}
