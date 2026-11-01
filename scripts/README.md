# scripts/

운영 머신(저장소 루트)에서 `pnpm tsx scripts/<폴더>/<이름>.ts` 로 실행한다. `.env.local` 을 스스로 읽는 스크립트가 대부분이며, 필요한 변수는 각 파일 머리말에 있다.

| 폴더 | 성격 | 예 |
|---|---|---|
| `verify/` | 외부 연동·가드가 살아 있는지 확인(읽기 전용) | `verify-youtube` `verify-podcast-audio` `verify-ingest-guards` `verify-admin-auth` `verify-local-ai` `verify-story-dedupe` |
| `ops/` | 반복해서 쓰는 유지보수 — 계정·재계산·중복 정리·재변환 | `create-admin-user` `bootstrap-admin-role` `reembed-local` `rematch-all` `recompute-temperature` `merge-duplicate-issues` `merge-duplicate-pairs` `sweep-forum-images` `gen-crossview-headlines` `gen-crossview-images` `resynth-podcast-gemini` `reconvert-crossview-webp` · `backup-db.sh`(야간 백업, launchd 04:20) |
| `report/` | 검증지표·평가 — 관리자 `/admin/metrics` 와 같은 `lib/metrics` | `report-stage1` `eval-matching` `measure-podcast-okcheon` |
| `scrape/` | 수집(크론이 부르는 것 포함) | `scrape-oc-notices`(launchd 매일 19:00) |
| `sentiment/` | 감정 분류 Python 사이드카(`lib/ai/local-sentiment` 가 호출) | `classify_ko.py` |
| `once/` | 한 번 쓰고 끝난 운영 보정·표본 분석 — 기록용 | `backfill-*` `apply-codex-crossview` `sql/` |

`guard-build.mjs` 는 `pnpm build` 가 엉뚱한 워크트리에서 돌지 않게 막는 가드다(배포 머신 밖에서는 그냥 통과).

**운영 리포에만 있고 공개 리포에는 없는 것**: 두 매체 전용 수집기 `scrape-mbc-archive` `scrape-okinews-archive` `scrape-okinews-forum` `verify-okinews`(공개는 데이터 이용 허락이 아니다 — README 「개인정보와 권리」), 운영 머신 전용 셸 `deploy.sh`(라이브 배포) `setup-mac.sh`(첫 설치) `export-oss.sh`(공개 리포 스냅샷), 그리고 `once/` 전체. 다른 지역판은 `RSS_MACRO_FEED_URL`/`RSS_MICRO_FEED_URL` 또는 `lib/adapters/` 인터페이스로 자기 수집기를 둔다.

`package.json` 의 단축 명령: `pnpm verify:*` `pnpm report:stage1` `pnpm eval:matching` `pnpm admin:bootstrap`.
