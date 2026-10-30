# deploy/launchd

macOS self-host 의 상시 프로세스와 크론 정의(launchd). 자세한 절차는 [`docs/deploy/mac-runbook.md`](../docs/deploy/mac-runbook.md).

| 파일 | 역할 | 주기 |
|---|---|---|
| `kr.zone2.server.plist` | `next start` :3002 (KeepAlive) | 상시 |
| `kr.zone2.tunnel.plist` | Cloudflare Tunnel 커넥터(http2) — 포트 개방 없이 외부 노출 | 상시 |
| `kr.zone2.ingest.plist` | `/api/cron/ingest` 수집 → 매칭 체인 | 매시 |
| `kr.zone2.temperature.plist` | `/api/cron/temperature` 공론 온도 | 15분 |
| `kr.zone2.podcast.plist` | `/api/cron/podcast` (KST 07시 생성, 그 외 시각은 감시) | 매시 |
| `kr.zone2.crossview-images.plist` | 카드 일러스트 생성 | 일 1회 |
| `kr.zone2.oc-notices.plist` | `scripts/scrape/scrape-oc-notices.ts` 군청 공고 | 매일 19:00 |
| `kr.zone2.backup.plist` | `~/zone2-backups/bin/backup-db.sh`(`scripts/ops/backup-db.sh` 의 사본 — launchd 의 /bin/bash 는 TCC 때문에 `~/Documents` 를 못 읽는다) — DB 덤프(14일 보존) + 일요일 저장소 묶음(4개 보존) → `~/zone2-backups/`. 설치·갱신은 `bash scripts/ops/backup-db.sh --install` | 매일 04:20 |

설치: 파일 안의 `__ZONE2_DIR__` 을 저장소 절대 경로로 바꾸고 `~/Library/LaunchAgents/` 에 복사한 뒤 `launchctl bootstrap gui/$(id -u) <plist>`. 크론은 `CRON_SECRET` 헤더로 `/api/cron/*` 를 호출한다(`.env.example`). 운영 중 재시작은 `launchctl kickstart -k gui/$(id -u)/<label>`; plist 를 고쳤을 때만 `bootout` 뒤 `bootstrap`.
