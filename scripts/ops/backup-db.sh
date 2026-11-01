#!/usr/bin/env bash
# ============================================================================
# scripts/ops/backup-db.sh — 운영 DB·스토리지 야간 백업 (2026-10-27, 대표 지시)
#
#   bash scripts/ops/backup-db.sh            # DB 덤프(매일) + 스토리지 묶음(일요일 또는 7일 넘게 없을 때)
#   bash scripts/ops/backup-db.sh --storage  # 스토리지 묶음도 지금 강제
#   bash scripts/ops/backup-db.sh --install  # 사본을 ~/zone2-backups/bin/ 에 두고 launchd 잡(kr.zone2.backup) 설치·갱신
#
# launchd 는 저장소의 이 파일이 아니라 ~/zone2-backups/bin/backup-db.sh 사본을 돌린다 — launchd 가 띄운 /bin/bash 는 macOS 폴더
# 보호(TCC) 때문에 ~/Documents 를 읽지 못한다(2026-10-27 exit 126). 이 파일을 고치면 --install 을 다시 돌린다(deploy.sh 가 사본을 자동 갱신).
#
# 결과: $ZONE2_BACKUP_DIR(기본 ~/zone2-backups)/db/zone2-db-YYYYMMDD.dump (pg_dump -Fc, 14일 보존)
#       $ZONE2_BACKUP_DIR/storage/zone2-storage-YYYYMMDD.tgz (Supabase Storage 볼륨 전체, 4개 보존)
# 덤프는 컨테이너 안의 pg_dump/pg_restore 로 만들고 목차를 읽어 검증한 뒤에만 제자리에 둔다(깨진 파일이 남지 않게).
# 복원 절차는 docs/deploy/mac-runbook.md §12. launchd: deploy/launchd/kr.zone2.backup.plist (매일 04:20)
# ============================================================================
set -euo pipefail
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin"
umask 077  # 덤프에 전 데이터가 들어 있다 — 소유자만 읽는다(폴더 700 · 파일 600)

DB_CONTAINER="${ZONE2_DB_CONTAINER:-supabase_db_zone-2}"
ST_CONTAINER="${ZONE2_STORAGE_CONTAINER:-supabase_storage_zone-2}"
ROOT="${ZONE2_BACKUP_DIR:-$HOME/zone2-backups}"
DB_KEEP_DAYS="${ZONE2_BACKUP_DB_KEEP_DAYS:-14}"
ST_KEEP="${ZONE2_BACKUP_STORAGE_KEEP:-4}"
FORCE_STORAGE=0; [ "${1:-}" = "--storage" ] && FORCE_STORAGE=1
TODAY="$(date +%Y%m%d)"
log() { printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }

# ---- --install: 사본 + launchd 잡 -----------------------------------------------
if [ "${1:-}" = "--install" ]; then
  SELF="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
  PLIST_SRC="$(cd "$(dirname "$0")/../../deploy/launchd" && pwd)/kr.zone2.backup.plist"
  PLIST_DST="$HOME/Library/LaunchAgents/kr.zone2.backup.plist"
  mkdir -p "$ROOT/bin" "$HOME/Library/LaunchAgents"; chmod 700 "$ROOT" "$ROOT/bin"
  install -m 700 "$SELF" "$ROOT/bin/backup-db.sh"
  sed "s|__HOME__|$HOME|g" "$PLIST_SRC" > "$PLIST_DST"
  launchctl bootout "gui/$(id -u)/kr.zone2.backup" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$PLIST_DST"
  log "✓ 설치 — $ROOT/bin/backup-db.sh · $PLIST_DST (매일 04:20). 시험: launchctl kickstart gui/\$(id -u)/kr.zone2.backup; tail /tmp/zone2-backup.log"
  exit 0
fi

mkdir -p "$ROOT/db" "$ROOT/storage"
chmod 700 "$ROOT" "$ROOT/db" "$ROOT/storage"
find "$ROOT/db" "$ROOT/storage" -maxdepth 1 -type f \( -name 'zone2-db-*.dump' -o -name 'zone2-storage-*.tgz' \) -exec chmod 600 {} + 2>/dev/null || true
docker inspect -f '{{.State.Running}}' "$DB_CONTAINER" 2>/dev/null | grep -q true || { log "✖ DB 컨테이너가 떠 있지 않다: $DB_CONTAINER"; exit 1; }

# ---- 1. DB 덤프 ----------------------------------------------------------------
DB_OUT="$ROOT/db/zone2-db-$TODAY.dump"
docker exec "$DB_CONTAINER" pg_dump -U postgres -Fc -d postgres > "$DB_OUT.tmp"
TABLES="$(docker exec -i "$DB_CONTAINER" pg_restore -l < "$DB_OUT.tmp" | grep -c 'TABLE DATA' || true)"
[ "${TABLES:-0}" -ge 20 ] || { log "✖ DB 덤프 검증 실패(TABLE DATA ${TABLES:-0}개)"; rm -f "$DB_OUT.tmp"; exit 1; }
mv "$DB_OUT.tmp" "$DB_OUT"
log "✓ DB 덤프 $(du -h "$DB_OUT" | cut -f1) · 테이블 ${TABLES}개 → $DB_OUT"
# 보존 기간 지난 덤프 정리 — 이 폴더 바로 아래, 여덟 자리 날짜 이름의 일반 파일만(수동 보관본 zone2-db-before-x.dump 는 건드리지 않는다). .tmp 찌꺼기도
D8='[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]'
find "$ROOT/db" -maxdepth 1 -type f -name "zone2-db-$D8.dump" -mtime +"$DB_KEEP_DAYS" -delete
find "$ROOT/db" -maxdepth 1 -type f -name '*.tmp' -mmin +180 -delete

# ---- 2. 스토리지(공론장 사진·팟캐 음성·카드 이미지) ------------------------------
need_storage=$FORCE_STORAGE
if [ "$need_storage" = 0 ]; then
  [ "$(date +%u)" = 7 ] && need_storage=1                                                  # 일요일
  [ -z "$(find "$ROOT/storage" -maxdepth 1 -type f -name "zone2-storage-$D8.tgz" -mtime -7 2>/dev/null)" ] && need_storage=1  # 최근 7일 치가 없다
fi
if [ "$need_storage" = 1 ]; then
  if docker inspect -f '{{.State.Running}}' "$ST_CONTAINER" 2>/dev/null | grep -q true; then
    ST_OUT="$ROOT/storage/zone2-storage-$TODAY.tgz"
    docker exec "$ST_CONTAINER" tar czf - -C /mnt . > "$ST_OUT.tmp"
    FILES="$(tar tzf "$ST_OUT.tmp" | grep -vc '/$' || true)"
    [ "${FILES:-0}" -ge 1 ] || { log "✖ 스토리지 묶음 검증 실패"; rm -f "$ST_OUT.tmp"; exit 1; }
    mv "$ST_OUT.tmp" "$ST_OUT"
    log "✓ 스토리지 $(du -h "$ST_OUT" | cut -f1) · 파일 ${FILES}개 → $ST_OUT"
    # 최신 ST_KEEP 개만 남긴다(이름의 날짜 순 = 시간 순). 여덟 자리 날짜 이름의 일반 파일만
    n=0
    while IFS= read -r -d '' f; do n=$((n + 1)); [ "$n" -gt "$ST_KEEP" ] && rm -f "$f"; done < <(find "$ROOT/storage" -maxdepth 1 -type f -name "zone2-storage-$D8.tgz" -print0 | sort -z -r)
    find "$ROOT/storage" -maxdepth 1 -type f -name '*.tmp' -mmin +180 -delete
  else
    log "✖ 스토리지 묶음이 필요한 날인데 컨테이너가 떠 있지 않다: $ST_CONTAINER"; exit 1
  fi
fi
log "· 보관 중: DB $(ls -1 "$ROOT/db"/zone2-db-*.dump 2>/dev/null | wc -l | tr -d ' ')개 · 스토리지 $(ls -1 "$ROOT/storage"/zone2-storage-*.tgz 2>/dev/null | wc -l | tr -d ' ')개 · 합계 $(du -sh "$ROOT" | cut -f1)"
