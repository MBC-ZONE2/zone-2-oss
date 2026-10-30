<p align="center">
  <img src="public/logos/zone2-black.png" alt="ZONE-2" width="360">
</p>
<p align="center"><strong>Two lenses, one story.</strong><br>광역과 기초, 두 시선을 한 사안으로 잇는 지역 뉴스 오픈소스</p>
<p align="center">한국어 · <a href="README.md">English</a></p>

# ZONE-2

광역 방송사와 기초 지역신문이 **같은 사안을 어떻게 다르게 보도하는지** 한 화면에 나란히 놓고, 그 아래 달리는 주민 여론을 AI로 다시 엮어 공론장으로 이어 주는 지역 뉴스 서비스입니다.

- **MBC충북**(광역 지상파) × **옥천신문**(기초 주간지) 컨소시엄
- 한국언론진흥재단 2026년 디지털 미디어 개발 지원사업
- 서비스: https://mbcok.com · 라이선스: [Apache License 2.0](LICENSE) ([NOTICE](NOTICE))

이 저장소는 그 소프트웨어 전체(웹 앱, AI 파이프라인과 프롬프트, 데이터베이스 스키마, 운영 스크립트)입니다. 다른 지역의 방송사·신문사 조합이 그대로 가져다 자기 지역판을 만들 수 있도록 공개합니다.

---

## 무엇을 하나

| 기능 | 하는 일 |
|---|---|
| **크로스뷰** | 두 매체 기사를 벡터 유사도 + AI 재랭킹으로 짝지어 "광역은 ○○ / 기초는 ○○" 두 줄 헤드라인, 관점별 요약, AI 정리 한 문단, 4페이지 카드 스토리로 보여 줍니다. 양사 검수자가 확인해 공개합니다(기본은 양측 확인, 한쪽 확인 즉시 공개로 바꿀 수 있습니다). |
| **공론 온도계** | 기사 댓글과 공론장 글을 사안별로 묶어 15분마다 온도(0~100 = 언급 빈도·감정 분산·주제 집중도)를 계산하고 TOP5를 보여 줍니다. 사안을 누르면 관련 기사 원문으로 갑니다. |
| **오늘의 충북(AI 팟캐스트)** | 매일 아침 두 매체의 기사에서 대본을 쓰고(옥천 소식 코너 보장) 음성으로 합성합니다. 양사 검수자가 확인해 공개합니다. 사람 확인이 전혀 없는 AI 생성물은 공개되지 않습니다. |
| **공론장** | 로그인 없는 익명 글·댓글(비밀번호로 수정·삭제), 사진 1장, 공감, 사안별 묶음. 자동등록방지(서명 덧셈 문제 + 숨은 칸)와 금칙어 필터가 있습니다. |
| **공고** | 군청 게시판 4종을 긁어 마감일 순으로 정리합니다. |
| **관리자** | 검수 큐(양사 확인 현황), 콘텐츠 되돌리기, 감사 로그, 계정·권한, 검증지표 대시보드(`/admin/metrics`). |

화면은 「일점(一點) 지면」이라 부르는 한 가지 문법으로 짭니다. 종이색 바탕에 잉크 활자와 1px 괘선뿐이고, 카드·둥근 모서리·그림자를 쓰지 않습니다. 주황은 재생과 마감에만, 빨강은 온도에만 씁니다. 큰 글자 모드와 고대비 모드를 모든 화면이 지원합니다.

## 어떻게 돌아가나

```
수집(매시)  MBC충북 CMS · 유튜브 영상+댓글 · 옥천신문 CMS · 여론광장 · 군청 공고
   │  정규화 → 작성자 즉시 해시 → 임베딩(pgvector)
   ▼
매칭        반대 매체 Top-N(코사인) → 날짜·키워드 필터 → LLM 재랭킹 → 관점 요약 → 카드 데이터
   │        같은 제목의 뉴스+영상은 한 기사로, 라이브·다시보기는 제외
   ▼
온도(15분)  사안 키워드 → 지역 기사 → 그 기사의 댓글 + 공론장 글 → 감정 분류 → 온도·순위
   ▼
팟캐(07시)  크로스뷰 쌍 → 옥천 기사 → MBC 기사 순으로 재료 수집 → 대본 → 한국어 윤문 → TTS → 검수 큐
   ▼
검수        양사 계정 확인(크로스뷰·팟캐, 기본 양측 확인) → 공개 → 감사 로그·검증지표
```

### 실제로 쓰는 스택

맥 미니 한 대에 self-host 로 운영합니다. 외부 의존은 Supabase(self-host)와 선택적인 AI 키뿐입니다.

| 층 | 채택 | 메모 |
|---|---|---|
| 앱 | Next.js 15 (App Router) · React 19 · TypeScript · Tailwind v4 | `pnpm build` 결과를 `next start` 로 서빙 |
| DB | Supabase self-host (Postgres + pgvector + Realtime + Auth + Storage) | Docker, `supabase/migrations` |
| 스케줄 | macOS launchd(`deploy/launchd/*.plist`) → `/api/cron/*` 를 `CRON_SECRET` 으로 호출 | 수집 매시 · 온도 15분 · 팟캐 매시 호출(KST 07시 생성) · 공고 매일 |
| 매칭 재랭킹·요약·헤드라인·사안 추출 | 구독형 코딩 CLI(`LOCAL_AI_CLI=codex`) 또는 Claude API(`ANTHROPIC_API_KEY`) | 프롬프트는 `lib/ai/*` |
| 임베딩 | 로컬 모델(`lib/ai/local-embed`) 또는 OpenAI | |
| 감정 분류 | 로컬 KcELECTRA 사이드카(`LOCAL_SENTIMENT=1`, Python) → CLI → Claude 순 폴백 | 댓글 도메인 모델 |
| 음성 | Gemini TTS(아나운서 톤) → OpenAI TTS → macOS `say` 폴백, ffmpeg 로 MP3 | 대본 윤문은 [im-not-ai](https://github.com/epoko77-ai/im-not-ai) 룰북 |
| 외부 노출 | Cloudflare Tunnel(원격 관리형) | WAF·캐시는 대시보드 |

## 로컬에서 띄우기

필요한 것: Node 22+, pnpm 10, Docker, Supabase CLI, ffmpeg(팟캐 음성). Python 3 은 로컬 감정 모델을 쓸 때만.

```bash
pnpm install --frozen-lockfile
cp .env.example .env.local             # 값은 아래 표 참고 — 키 없이도 화면은 뜬다
supabase start                          # 로컬 Supabase (Docker)
supabase db reset                       # 마이그레이션 전부 적용 + 합성 시드(supabase/seed.sql) — 홈이 바로 찬다
                                        # ↑ 새 로컬 DB 전용. 운영 DB 가 붙은 머신에서는 절대 금지 — 데이터가 전부 지워진다
pnpm dev                                # http://localhost:3000
```

`supabase db reset` 이 **합성 시드**(가상의 두 매체 기사 쌍·댓글·사안 온도·크로스뷰·팟캐 회차·공론장 글·공고)를 넣어 키 없이도 홈·크로스뷰·온도계·팟캐·공론장·공고가 찬 상태로 뜹니다. 실데이터는 두 매체의 RSS 주소만 넣으면 매시 수집이 돕니다 — `RSS_MACRO_FEED_URL`(광역) / `RSS_MICRO_FEED_URL`(기초). 기본으로 켜진 **데모 어댑터**(키 없이 합성 기사 수집)는 실수집을 붙인 뒤 `DEMO_ADAPTERS=0` 으로 끕니다.

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" localhost:3000/api/cron/ingest
curl -X POST -H "Authorization: Bearer $CRON_SECRET" localhost:3000/api/cron/match
curl -X POST -H "Authorization: Bearer $CRON_SECRET" localhost:3000/api/cron/temperature
curl -X POST -H "Authorization: Bearer $CRON_SECRET" "localhost:3000/api/cron/podcast?force=1"
```

관리자 계정은 스크립트로 만듭니다(역할: 관리자 / MBC충북 기자 / 옥천신문 기자).

```bash
pnpm tsx scripts/ops/create-admin-user.ts --email=you@example.org --role=super_admin --name=이름
```

### 환경변수 (전체 목록은 `.env.example`)

| 묶음 | 변수 | 비고 |
|---|---|---|
| 필수 | `NEXT_PUBLIC_SUPABASE_URL` `NEXT_PUBLIC_SUPABASE_ANON_KEY` `SUPABASE_SERVICE_ROLE_KEY` `CRON_SECRET` `INGEST_HASH_SALT` `FORUM_HASH_PEPPER` `VISIT_HASH_PEPPER` | salt·pepper 는 `openssl rand -hex 32`. 운영(production)에서 비면 해당 경로가 멈춘다 |
| AI(택1 이상) | `LOCAL_AI_CLI` 또는 `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GOOGLE_GENERATIVE_AI_API_KEY` | 없으면 결정적 목업으로 동작. 구독형 CLI(codex·claude)를 서버 자동화에 쓰는 것은 각 제공자 약관을 직접 확인해야 하며, 운영은 API 키를 권장 |
| 수집 | `RSS_MACRO_FEED_URL` `RSS_MICRO_FEED_URL`(범용 RSS/Atom, 쉼표로 여러 개) · `YOUTUBE_API_KEY` `MBC_YOUTUBE_CHANNEL_ID` · `DEMO_ADAPTERS` | 피드가 없는 매체는 `lib/adapters/` 인터페이스로 어댑터를 추가 |
| 운영 | `PODCAST_AUTO_PUBLISH_HOUR`(기본 `off`) `LOCAL_SENTIMENT*` `TTS_PROVIDER` | |

## 운영하기 (self-host)

`docs/deploy/mac-runbook.md` 가 설치부터 크론·터널까지의 절차입니다. 요지는 이렇습니다.

- 서버는 `next start` 를 launchd 가 상시 실행하고, 배포는 `git pull → pnpm build → launchctl kickstart -k` 입니다.
- 크론은 launchd 가 매시/15분마다 `curl` 로 `/api/cron/*` 를 두드립니다. 시간대는 서버가 KST 로 판정하므로 머신 시간대 설정에 좌우되지 않습니다.
- 무음 실패는 `system_alerts` 에 쌓여 관리자 대시보드 상단에 뜹니다(재랭킹 실패, 감정 분류 경로 이상, 팟캐 미생성·검수 대기 등).
- 검증지표(매칭 정확도, 수집 성공률, 온도 작동률, 팟캐 발행률, 재방문율, 검수 승인율)는 `/admin/metrics` 와 `pnpm report:stage1` 이 같은 함수로 계산합니다.

## 개인정보와 저작권

> **이 저장소의 공개는 MBC충북·옥천신문의 기사·댓글·사진 데이터를 수집하거나 이용할 권리를 부여하지 않습니다.** 두 매체의 수집기는 컨소시엄 운영에만 쓰이며 공개 리포에는 포함하지 않습니다(자리에 빈 스텁). 다른 지역판은 자기 매체의 허가 아래 `lib/adapters/` 인터페이스로 자기 어댑터를 구현해야 합니다.


- 댓글·글 작성자는 수집 즉시 SHA-256 으로 해시하고 원본을 저장하지 않습니다. 공론장 글의 IP 도 해시로만 둡니다.
- 방문 통계는 브라우저의 무작위 ID 를 서버에서 한 번 더 해시한 값과 날짜만 하루 1건 저장하며 180일 뒤 지웁니다. 외부 분석 도구와 쿠키 배너가 없습니다.
- 기사 원문은 각 매체의 저작물입니다. 크로스뷰는 요약과 비교를 ZONE-2 의 편집 화자로 말하고 원문 제목·링크·발행일을 그대로 보존합니다.
- "MBC충북", "옥천신문" 의 명칭과 로고는 각 사의 상표로 이 라이선스의 대상이 아닙니다. 포크할 때는 자사 표식으로 바꿔 주세요(`NOTICE`).

## 저장소 안내

```
config/         지역판 설정 한 파일(region.ts) — 매체명·지명·코너명·로고·재단 표기
app/            화면·API 라우트(/api/cron/*, /api/admin/*, 공개 API)
components/     UI(크로스뷰·온도계·팟캐·공론장·관리자·홈 덱)
lib/            도메인 로직 — ai(프롬프트·모델 호출) · matching · temperature · podcast · forum · metrics · ingest
supabase/       마이그레이션(스키마·RLS·RPC)
scripts/        verify(연동 확인) · ops(유지보수) · report(지표·평가) · scrape(수집) · sentiment(감정 사이드카) — scripts/README.md
deploy/         launchd 정의(서버·터널·크론) — deploy/README.md
docs/           설계 문서(기능정의 · 검증지표 · 데이터모델 · API 명세 · 운영 런북)
docs-site/      이용자용 안내(VitePress)
THIRD_PARTY_NOTICES.md · sbom.cdx.json   제3자 고지 · 종속성 목록(CycloneDX)
```

## 다른 지역에서 쓰려면

1. **`config/region.ts`** 한 파일에서 매체 이름·지명·코너 이름·공식 홈·로고·재단 표기를 바꿉니다([config/README.md](config/README.md)). 화면·대본·프롬프트·메타데이터·RSS 가 전부 따라옵니다.
2. 두 매체의 RSS/Atom 주소를 `RSS_MACRO_FEED_URL` / `RSS_MICRO_FEED_URL` 에 넣습니다. 피드가 없으면 `lib/adapters/` 인터페이스(`fetchArticles`·`fetchComments`)로 어댑터를 구현해 `registry.ts` 에 올립니다.
3. `public/logos/` 에 자사 로고를 넣고 `NOTICE` 의 매체명을 교체합니다.
4. 검수 계정을 두 매체 역할로 만듭니다. 확인 규칙(`docs/06-API명세.md` §4.1)은 기본이 양측 확인(`REQUIRED_CONFIRMATIONS=2`)이고, 한쪽 확인 즉시 공개로 바꾸려면 1 로 둡니다.

## 기여·문의

- 기여: [CONTRIBUTING.md](CONTRIBUTING.md) · 행동 강령: [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) · 보안 신고: [SECURITY.md](SECURITY.md)
- 제3자 라이선스: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) · SBOM: [sbom.cdx.json](sbom.cdx.json)
