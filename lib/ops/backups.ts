// ============================================================================
// lib/ops/backups — 야간 백업 파일 목록·열기(서버 전용, 파일 시스템) — 2026-10-27 대표 지시 "어드민에 백업 위치와 내려받기"
//
// scripts/ops/backup-db.sh 가 쓰는 곳을 그대로 읽는다: $ZONE2_BACKUP_DIR(기본 ~/zone2-backups)/db/zone2-db-YYYYMMDD.dump,
// /storage/zone2-storage-YYYYMMDD.tgz. 파일 이름은 정규식으로만 받아들이고(경로 조작 불가), 심링크는 목록에서 빼며
// 내려받기는 O_NOFOLLOW 로 한 번 열어 그 디스크립터로만 읽는다(stat 과 open 사이 바꿔치기 불가 — codex 2026-10-27).
// 권한: system.config(관리자) — 덤프에는 전 데이터가 들어 있다.
// ============================================================================

import "server-only";
import { constants, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { BACKUP_NAME_RE, type BackupFile, type BackupKind, type BackupSummary } from "./backups-shared";

export * from "./backups-shared";

export function backupDir(): string {
  return process.env.ZONE2_BACKUP_DIR?.trim() || path.join(os.homedir(), "zone2-backups");
}

function isEnoent(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "ENOENT";
}

async function listKind(kind: BackupKind): Promise<BackupFile[]> {
  const dir = path.join(backupDir(), kind);
  let names: string[];
  try {
    names = await fs.readdir(dir);
  } catch (e) {
    if (isEnoent(e)) return []; // 아직 한 번도 안 돌았다 — 빈 목록. 권한·I/O 오류는 위로 올려 화면이 "없음" 으로 속이지 않게
    throw e;
  }
  const out: BackupFile[] = [];
  for (const name of names) {
    if (!BACKUP_NAME_RE[kind].test(name)) continue;
    try {
      const st = await fs.lstat(path.join(dir, name)); // 심링크는 제외
      if (st.isFile()) out.push({ kind, name, size: st.size, mtime: st.mtime.toISOString() });
    } catch (e) {
      if (!isEnoent(e)) throw e; // 지워지는 중이면 건너뛴다
    }
  }
  return out.sort((a, b) => (a.mtime < b.mtime ? 1 : -1));
}

export async function getBackupSummary(now: Date = new Date()): Promise<BackupSummary> {
  const [db, storage] = await Promise.all([listKind("db"), listKind("storage")]);
  const files = [...db, ...storage];
  const latestDb = db[0] ?? null;
  const latestStorage = storage[0] ?? null;
  return {
    dir: backupDir(),
    files,
    latestDb,
    latestStorage,
    dbAgeHours: latestDb ? Math.round(((now.getTime() - Date.parse(latestDb.mtime)) / 3_600_000) * 10) / 10 : null,
    totalBytes: files.reduce((s, f) => s + f.size, 0),
  };
}

/**
 * 내려받기용으로 연다 — 이름이 규칙에 맞는 일반 파일만. 심링크면 열지 않는다(O_NOFOLLOW).
 * 반환한 핸들은 호출자가 닫거나 스트림이 닫는다. 없으면 null.
 */
export async function openBackupFile(kind: BackupKind, name: string): Promise<{ handle: fs.FileHandle; size: number } | null> {
  if (!BACKUP_NAME_RE[kind].test(name)) return null;
  const file = path.join(backupDir(), kind, name);
  let handle: fs.FileHandle;
  try {
    handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch {
    return null;
  }
  const st = await handle.stat();
  if (!st.isFile()) {
    await handle.close();
    return null;
  }
  return { handle, size: st.size };
}
