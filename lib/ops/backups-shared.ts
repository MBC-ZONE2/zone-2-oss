// ============================================================================
// lib/ops/backups-shared — 백업 현황의 타입·표시 유틸(브라우저 안전). 파일 시스템은 lib/ops/backups(서버 전용)에만.
// ============================================================================

export type BackupKind = "db" | "storage";

export interface BackupFile {
  kind: BackupKind;
  name: string;
  /** 바이트 */
  size: number;
  /** ISO */
  mtime: string;
}

export interface BackupSummary {
  /** 백업 폴더 절대 경로(운영 머신) */
  dir: string;
  files: BackupFile[];
  latestDb: BackupFile | null;
  latestStorage: BackupFile | null;
  /** 마지막 DB 덤프 뒤 지난 시간 — 없으면 null */
  dbAgeHours: number | null;
  /** 폴더 합계 바이트 */
  totalBytes: number;
}

/** 24시간마다 돌아야 하는 잡이라 이보다 오래되면 경고 */
export const BACKUP_STALE_HOURS = 30;

/** 운영 파일 이름 — 여덟 자리 날짜만(수동 보관본 zone2-db-before-x.dump 는 목록·정리 대상이 아니다) */
export const BACKUP_NAME_RE: Record<BackupKind, RegExp> = {
  db: /^zone2-db-\d{8}\.dump$/,
  storage: /^zone2-storage-\d{8}\.tgz$/,
};

export function isBackupKind(v: unknown): v is BackupKind {
  return v === "db" || v === "storage";
}

export function formatBytes(n: number): string {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))}KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(n < 100 * 1024 * 1024 ? 1 : 0)}MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)}GB`;
}
