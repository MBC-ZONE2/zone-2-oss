# 기여 가이드

> **English summary.** ZONE-2 is a local news service that shows how a regional broadcaster and a town newspaper cover the same story, and turns the public comments underneath into an AI-assisted forum. It is Apache-2.0 so other regions can run their own edition. Before a PR: `pnpm install --frozen-lockfile`, then `pnpm exec tsc --noEmit -p . && pnpm exec eslint . && pnpm build` (same as CI). One change per PR, branch `feature/<short-name>` into `main`, commit prefix `[feat]` `[fix]` `[docs]` `[design]` `[refactor]` `[ops]`. Update `docs/` in the same PR when behavior changes. Schema changes are one forward-only file in `supabase/migrations/` with a unique `NNNN` version (never edit an applied file; it must work on a fresh database and on the previous state, guarded with `if not exists` where possible); never use an enum value added by `alter type … add value` in the same file (one file = one transaction), and check that `supabase start` applies everything on a fresh database. Never commit keys, peppers, or collected article/comment text; authors stay hashed at ingest. UI follows one grammar: paper ground, ink type, 1 px rules, no cards/radius/shadows; orange only for play and deadlines, red only for temperature. Security issues go through [SECURITY.md](SECURITY.md), not public issues. Issues and PRs may be written in English or Korean.

ZONE-2 는 광역 방송사(MBC충북)와 기초 지역신문(옥천신문)이 같은 사안을 어떻게 다르게 보도하는지 나란히 놓고, 주민 여론을 AI 로 엮어 공론장으로 이어 주는 지역 뉴스 서비스입니다. 다른 지역의 방송사·신문사 조합이 가져다 자기 지역판을 만들 수 있도록 Apache-2.0 으로 공개합니다.

## 먼저 읽을 것
- [README](README.md) — 무엇을 하는지, 로컬에서 띄우는 법, 실제로 쓰는 스택
- [`docs/01-기능정의.md`](docs/01-기능정의.md) — 기능별 결정 사항의 누적 기록(왜 지금 모양인지)
- [`docs/06-API명세.md`](docs/06-API명세.md) — 공개 API·크론·관리자 API, 이중 확인 규칙
- [`scripts/README.md`](scripts/README.md) · [`deploy/README.md`](deploy/README.md) — 운영 스크립트와 launchd

## 실제로 쓰는 스택
Next.js 15(App Router, TypeScript) · self-host(`next start`) · Supabase self-host(Postgres + pgvector, Auth, Storage) · launchd 크론 · Cloudflare Tunnel. AI 는 구독 CLI(codex) 재랭킹·대본, Gemini TTS, 로컬 감정 분류 모델을 쓰며 각각 폴백이 있습니다. 설계 초안(`docs/03`)의 Cloudflare Workers 구성은 쓰지 않습니다.

## 개발 흐름
```bash
pnpm install --frozen-lockfile
cp .env.example .env.local      # Supabase URL·키만 있어도 화면은 뜹니다
pnpm dev
pnpm exec tsc --noEmit -p . && pnpm exec eslint . && pnpm build   # PR 전 — CI 와 같은 검사
```
- 브랜치: `feature/<짧은-설명>` → `main` 으로 PR. 작은 PR 하나에 한 가지 변경.
- 커밋 메시지 머리: `[feat]` `[fix]` `[design]` `[admin]` `[metrics]` `[ops]` `[docs]`.
- 기능을 바꾸면 **같은 PR 에서 `docs/` 를 갱신**합니다(결정 기록이 코드와 어긋나지 않게).
- 스키마 변경은 `supabase/migrations/NNNN_<이름>.sql` 한 파일, 앞으로만 간다(forward-only — 이미 적용된 파일은 고치지 않고 새 파일을 더한다). 새 DB 와 직전 상태의 DB 양쪽에서 돌아야 하고 가능하면 `if not exists`·`drop … if exists` 로 다시 돌려도 안전하게. 번호 `NNNN` 은 유일해야 하고(CLI 가 버전 키로 기록), `alter type … add value` 로 넣은 enum 값은 같은 파일에서 쓰지 않는다(파일 하나가 한 트랜잭션 — 다음 파일에서 쓴다). 새 DB 에서 `supabase start` 가 끝까지 도는지 확인한 뒤 PR.

## 화면 규약 — 「일점(一點) 지면」
종이색 바탕(`#f4f5f7`)에 잉크(`#111`)와 1px 괘선만 씁니다. 카드·둥근 모서리·그림자 없음(사진만 예외). 주황은 재생·마감, 빨강은 온도에만. 모든 화면은 큰 글자·고대비 모드를 지원해야 합니다. 새 컴포넌트는 기존 `app/*.css` 토큰을 쓰고 새 색을 만들지 않습니다.

## 데이터·개인정보
- 기사 원문·댓글은 각 매체 저작물입니다. 저장소에 실데이터를 넣지 않습니다(테스트는 합성 데이터).
- 댓글 작성자는 수집 즉시 해시(`lib/ingest/hash`)하고 원문 식별자를 저장하지 않습니다. 이 경계를 넘는 변경은 PR 설명에 이유를 적어 주세요.
- 비밀값(키·토큰·pepper)은 `.env.local` 에만. 커밋 전 `git diff` 에 `sk-`·`eyJ` 같은 패턴이 없는지 확인합니다.

## 리뷰
PR 은 유지 관리자 한 명 이상이 봅니다. 운영 중인 서비스라 배포는 컨소시엄이 따로 하며, 병합이 곧 배포는 아닙니다. 보안 문제는 이슈 대신 [SECURITY.md](SECURITY.md) 의 비공개 경로로 알려 주세요. 행동 규범은 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
