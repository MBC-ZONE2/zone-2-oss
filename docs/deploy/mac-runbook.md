# ZONE-2 Mac 자립 실행 런북

새 Mac(Mini·Studio)에서 이 프로젝트를 **지금 개발 머신과 동일하게** 띄우는 절차.
운영 방침은 Mac self-host이며, 이 문서는 그 재현 매뉴얼이다.

> ⚠️ **macOS 필수.** 팟캐스트 실음성이 macOS 내장 TTS(`say`)에 의존한다.
> Linux/CF 환경은 실 OpenAI TTS 키가 있어야 소리가 난다(§9-대안).

절차는 성격별로 셋으로 나뉜다. **🟢 자동**은 `scripts/setup-mac.sh`가 처리하고,
**🔴 수동**은 사람이 직접 해야 하며 스크립트가 그 지점에서 멈춰 안내한다.

| 단계 | 성격 | 자동화 |
|---|---|---|
| 1 사전 준비(brew·docker) | 🟢 자동 | setup-mac.sh |
| 2 저장소·의존성 | 🟢 자동 | setup-mac.sh |
| 3 시크릿 `.env.local` | 🔴 수동 | 사람 |
| 4 Supabase 로컬 스택·마이그레이션 | 🟢 자동 | setup-mac.sh |
| 5 macOS 프리미엄 음성 | 🔴 수동 | 사람(시스템 설정) |
| 6 Codex 로그인(크로스뷰용) | 🔴 수동 | 사람 |
| 7 데이터 재현(수집·매칭·백필) | 🟢 반자동 | 스크립트, 일부 Codex |
| 8 서빙 | 🟢 자동 | 명령 |
| 9 크론 자동화(launchd) | 🟢 자동 | plist |
| 10 외부 노출(Tunnel) | 🔴 수동 | cloudflared |

---

## 검증 기준값 (이 문서 작성 시점, 2026-07)

새 머신에서 아래와 같거나 상위 버전이면 된다.

```
node      v24.2.0
pnpm      10.32.1
docker    28.3.0
supabase  2.34.3   (CLI)
ffmpeg    8.0.1
lame      (brew)
macOS     Yuna (Premium) 음성 설치 필요
```

마이그레이션: `supabase/migrations/0001~0008` (전량 적용 대상)

---

## 1. 사전 준비 🟢

```bash
# Homebrew (없으면)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 런타임·도구
brew install node pnpm supabase/tap/supabase ffmpeg lame
brew install --cask docker   # Docker Desktop

# Docker Desktop 은 앱을 한 번 실행해 데몬을 띄워야 한다
open -a Docker
```

`corepack`으로 pnpm을 고정하려면: `corepack enable && corepack prepare pnpm@10.32.1 --activate`

---

## 2. 저장소 · 의존성 🟢

```bash
git clone https://github.com/MBC-ZONE2/zone-2.git
cd zone-2
pnpm install --frozen-lockfile
```

---

## 3. 시크릿 `.env.local` 🔴 수동

`.env.local`은 git에 없다(보안). **보안 채널로 옮기거나 새로 생성**한다.

```bash
cp .env.example .env.local
```

채울 값:

| 키 | 값 | 출처 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `http://127.0.0.1:54321` | 로컬 기본 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | (§4 `supabase start` 출력) | supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | (§4 출력) | supabase |
| `CRON_SECRET` | 임의 문자열 | `openssl rand -hex 24` |
| `INGEST_HASH_SALT` | 임의 문자열 | `openssl rand -hex 24` |
| `FORUM_HASH_PEPPER` | 임의 문자열 | `openssl rand -hex 24` |
| `YOUTUBE_API_KEY` | Google Cloud 발급 | 개발팀 |
| `MBC_YOUTUBE_CHANNEL_ID` | `UCFLTNsOlzlbAD18DrSREuMQ` | 공개 |
| `ANTHROPIC_API_KEY`·`OPENAI_API_KEY` | (있으면) | 콘솔 |

프리뷰/키리스 운용 플래그:

```
AI_MOCK=1                # 키 없으면 로컬 실동작(실음성·어절 임베딩)
YOUTUBE_INGEST_FORCE=1   # 6시간 게이트 무시(수동 수집·검증용). 운영은 미설정
MBC_CMS_CRAWL=1          # MBC CMS 개발용 크롤(정식 허가 전). 허가 후 공식 피드로 교체
DEMO_ADAPTERS=0          # 실데이터만. 데모 지면 원하면 미설정
```

> 🔴 실 키가 있으면 `AI_MOCK=0` — 그러면 실 OpenAI TTS·임베딩·Claude 매칭으로 자동 전환된다.

---

## 4. Supabase 로컬 스택 · 마이그레이션 🟢

```bash
supabase start --workdir .        # Docker에 로컬 스택 기동(kong 54321)
# 출력의 anon key / service_role key 를 §3 .env.local 에 반영
supabase db reset                 # 마이그레이션 0001~0008 일괄 적용
# ⚠ 위 db reset 은 "처음 설치할 때 빈 DB" 에만. 운영 데이터가 있는 뒤로는 절대 실행 금지 — DB 를 지우고 다시 만들며 합성 시드(supabase/seed.sql)가 들어간다.
#   이후 스키마 변경은 아래처럼 새 마이그레이션 파일만 docker exec psql 로 적용한다.
```

`db reset`이 시드까지 넘칠까 걱정되면, 마이그레이션만 순서대로:
```bash
for f in supabase/migrations/00*.sql; do
  docker exec -i supabase_db_zone-2 psql -U postgres -q < "$f"
done
```

> ⚠️ 다른 Supabase 프로젝트가 같은 Docker에 떠 있으면 포트가 충돌한다.
> 이 프로젝트는 default 포트(kong 54321). `supabase status`로 확인.

---

## 5. macOS 프리미엄 음성 🔴 수동

팟캐스트 실음성은 `say -v "Yuna (Premium)"`을 쓴다. **기계마다 한 번** 받아야 한다.

1. 시스템 설정 → **손쉬운 사용 → 음성 콘텐츠**
2. **시스템 음성** 오른쪽 관리/편집 → **한국어 → 유나(프리미엄)** 다운로드
3. 검증:
   ```bash
   say -v '?' | grep -i "Yuna (Premium)"   # 나오면 OK
   ```

프리미엄이 없으면 코드가 기본(compact) 음성으로 폴백한다(로봇 톤). 그래도 소리는 난다.

---

## 6. Codex 로그인 (크로스뷰 의미 매칭) 🔴 수동

크로스뷰 실데이터 매칭은 연결된 Codex(ChatGPT)로 돌린다. **선택**이지만 없으면
크로스뷰는 채워지지 않는다(빈 상태 또는 데모).

```bash
npm install -g @openai/codex
codex login                       # ChatGPT 계정 로그인
```

> 실 `OPENAI_API_KEY`가 있으면 `AI_MOCK=0`으로 임베딩 매칭이 자동 동작하므로 Codex는
> 검증·요약 보강용으로만 쓴다. 키·Codex 둘 다 없으면 크로스뷰는 비운다.

---

## 7. 데이터 재현 🟢 반자동

런타임 데이터(수집·매칭·팟캐스트)는 git에 없다. 스크립트로 채운다. **서버가 떠 있어야** 한다.

```bash
# 서버 기동(별 터미널)
PORT=3105 pnpm dev

# 아래는 서버가 뜬 뒤
SECRET=$(grep '^CRON_SECRET=' .env.local | cut -d= -f2)

# 1) 수집(어댑터 순회) + 매칭 체이닝
curl -X POST http://localhost:3105/api/cron/ingest -H "Authorization: Bearer $SECRET"

# 2) 로컬 임베딩 재적재(AI_MOCK 로컬 의미 임베딩)
pnpm tsx scripts/ops/reembed-local.ts --all

# 3) 온도 산출
curl -X POST http://localhost:3105/api/cron/temperature -H "Authorization: Bearer $SECRET"

# 4) 팟캐스트 7일치 백필(실음성 — §5 음성 필요)
pnpm tsx scripts/once/backfill-week.ts 7

# 5) 크로스뷰(Codex 필요 — §6). 후보 생성 → Codex 매칭 → 반영은
#    scripts/once/apply-codex-crossview.ts <matches.json> 로. 절차는 아래 주석 참조.

# 6) 크로스뷰 카드 이미지(Gemini). 신규 페어는 /api/cron/crossview-images 가 매시 채운다.
#    lib/ai/image.ts 가 원본 PNG({id}.png, 보존)와 함께 WebP({id}.webp, 가로 1080·q80)를
#    crossview 버킷에 올리고 card_image_url 은 WebP 를 가리킨다(sharp 로드 실패 시 PNG 폴백).
#    WebP 도입 전에 만든 PNG 행을 한 번 전환하려면(기본 dry-run, --apply 로 반영):
pnpm tsx scripts/once/backfill-crossview-webp.ts --apply

# 7) 옥천군청 공고 게시판 4종 수집(서버 불필요, .env.local 의 서비스 키만).
#    공지사항(bbsNo=36) · 고시공고(40) · 입법예고(41) · 채용공고(42) 를 차례로 —
#    게시판마다 목록 → 각 상세(400ms 간격) → 본문에서
#    "(신청|접수|모집|공고|열람|의견제출…)기간: 시작 ~ 끝" 을 파싱해
#    articles.raw.deadline("YYYY-MM-DD")·raw.period·body 에 넣는다.
#    채용공고만 목록에 '마감일' 칸이 있어 본문 파싱 대신 그 값을 쓴다.
#    category = 게시판 한글명, raw.board = 슬러그(notice/gosi/legis/recruit).
#    인자: [lookbackDays=60] [maxPages=20] — maxPages 는 **게시판 하나당** 페이지 수.
#    로그의 "마감 파싱 N건 (M%)" 이 성공률, "게시판별:" 줄이 게시판별 건수.
#    홈 '마감 D-day'·/notices 마감 정렬이 이 값을 읽으므로 하루 1회(아침) 재실행 권장 —
#    마감 없는 공고는 "기간 없는 공고" 로 내려가고, 마감 지난 공고는 목록에서 사라진다.
#    ※ 마이그레이션 0018(옛 category='공고' → '고시공고' 이관 + 부분 인덱스 조건 교체)이
#      적용된 뒤에 돌릴 것. 안 그러면 lookback 밖의 옛 공고가 목록에서 잠깐 빠진다.
pnpm tsx scripts/scrape/scrape-oc-notices.ts 30 8
```

> 크로스뷰 Codex 파이프라인은 대화형이라 완전 자동화가 어렵다(후보 파일 생성 →
> Codex에 매칭 위임 → 결과 JSON → apply). 상세는 `scripts/once/apply-codex-crossview.ts`
> 헤더 주석. 실 OpenAI 키가 있으면 이 단계 없이 `/api/cron/match`가 자동 매칭한다.

---

## 8. 서빙 🟢

개발/검증:
```bash
PORT=3105 pnpm dev
```

운영(빌드 후 상시):
```bash
pnpm build
PORT=3000 pnpm start
```

> ⚠️ `pnpm dev` 실행 중 같은 워크트리에서 `pnpm build`를 돌리면 `.next` 캐시가
> 깨진다. 빌드는 dev를 멈추고 하거나 별도 체크아웃에서.

**운영 배포는 한 줄로** (2026-10-11, 같은 실수 세 번째 재발 뒤 코드로 막음):
```bash
bash scripts/deploy.sh   # = pnpm deploy:ops
```
`scripts/deploy.sh` 는 ① git 최상위가 main 워크트리 ② 브랜치 main ③ 작업트리 깨끗함을 확인한 뒤
`design/ilzeom` ff-merge → `pnpm build` → BUILD_ID 변경 확인 → `launchctl kickstart -k` → 주요 경로 200 검증 →
push 순으로 돈다(`--no-merge`, `--no-push`, `SOURCE_BRANCH=`). 하나라도 어긋나면 그 자리에서 멈춘다.
`pnpm build` 자체도 `scripts/guard-build.mjs` 가 먼저 돌아 경로에 `zone-2-design` 이 있거나 브랜치가 `design/*` 이면
거부한다(프리뷰 빌드가 꼭 필요하면 `ALLOW_DESIGN_BUILD=1 pnpm build`). 커밋(디자인 워크트리)과 배포(main)를
**한 셸 명령에 `cd … &&` 로 묶지 말 것** — 앞의 cd 가 체인 전체에 적용된다.

---

## 9. 크론 자동화 (launchd) 🟢

`wrangler.toml`의 크론은 **Cloudflare용**이라 Mac에선 안 돈다. macOS는 **launchd**로
`/api/cron/*`를 주기 호출한다. 예시 plist는 `deploy/launchd/`에 있다(이 커밋에 동봉).

```bash
# CRON_SECRET을 plist가 읽도록 설정한 뒤
cp deploy/launchd/*.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/kr.zone2.ingest.plist
launchctl load ~/Library/LaunchAgents/kr.zone2.temperature.plist
launchctl load ~/Library/LaunchAgents/kr.zone2.podcast.plist
```

주기(정의서 기준): ingest 매시 · temperature 15분 · podcast 매일 07:00 KST.

### 실 OpenAI 키가 없을 때 (대안)
팟캐스트는 §5 macOS 음성으로 실음성이 나온다. 임베딩·매칭은 어절 임베딩(로컬)으로
동작하되 패러프레이즈 매칭은 약하다 — 크로스뷰는 Codex(§6)로 보완한다.

---

## 10. 외부 노출 (Cloudflare Tunnel) 🔴 수동

self-host를 외부에 공개하려면 Tunnel을 쓴다(포트 개방 없이).

```bash
brew install cloudflared
cloudflared tunnel login
cloudflared tunnel create zone2
# config.yml 에 도메인 → http://localhost:3000 매핑 후
cloudflared tunnel run zone2
```

상시화는 launchd `kr.zone2.tunnel`(deploy/launchd/kr.zone2.tunnel.plist → ~/Library/LaunchAgents). 커넥터 토큰은
`~/.cloudflared/zone2-connector-token.txt`(600)에서 읽어 `TUNNEL_TOKEN` 환경변수로 주입하고, ingress·DNS 는 Cloudflare 원격 관리.
로그 `/tmp/zone2-tunnel.log`.

**프로토콜은 `--protocol http2`**(2026-10-25, #189). 기본 quic 은 이 회선에서 "timeout: no recent network activity" 로
연결이 끊겼다 7초 뒤 재등록하는 일이 잦았고(9/8~10/22 94회), 그 사이 실린 요청이 엣지에서 520/502 로 떨어졌다.

**plist 를 고친 뒤에는 `kickstart -k` 로는 반영되지 않는다** — launchd 가 bootstrap 때의 ProgramArguments 를 들고 있다.
무중단으로 바꾸는 순서(같은 토큰으로 커넥터를 하나 더 띄워 두면 Cloudflare 가 두 커넥터에 분산한다):
```bash
# 1) 임시 커넥터(새 바이너리·http2) — 4개 연결 등록될 때까지 ~20초
( export TUNNEL_TOKEN="$(cat ~/.cloudflared/zone2-connector-token.txt)"; nohup cloudflared --no-autoupdate --protocol http2 tunnel run > /tmp/zone2-tunnel-temp.log 2>&1 & echo $! > /tmp/zone2-tunnel-temp.pid )
# 2) 서비스 재적재(plist 다시 읽음)
launchctl bootout gui/501/kr.zone2.tunnel && launchctl bootstrap gui/501 ~/Library/LaunchAgents/kr.zone2.tunnel.plist
grep "Registered tunnel connection" /tmp/zone2-tunnel.log | tail -4   # protocol=http2 확인
# 3) 임시 커넥터 종료
kill "$(cat /tmp/zone2-tunnel-temp.pid)"
```
업그레이드는 `brew upgrade cloudflared` 뒤 같은 순서(2026-10-25: 2026.7.2 → 2026.10.3).

---

## 11. 검증 체크리스트

```bash
pnpm typecheck && pnpm build          # 게이트
pnpm verify:youtube                    # 유튜브 어댑터(키 필요)
pnpm verify:okinews                    # 옥천 어댑터
pnpm verify:podcast                    # 오디오 저장·재생
pnpm verify:guards                     # 수집 안전장치
```

화면(로컬 3105):
- [ ] `/` 홈 — 공론 기상도·놓치면 손해·해결됐어요
- [ ] `/crossview` — 크로스뷰 목록(데이터 있으면)
- [ ] `/crossview/[id]` — 비교 지면 + 카드 이미지
- [ ] `/podcast` — 에피소드 재생 시 **실제 소리**(§5 음성). 새 회차 대본에 「오늘의 옥천」 코너("이어서 오늘의 옥천 소식입니다.")가 있는지 — 없으면 수집·프롬프트 회귀(#166). 2주에 한 번 `pnpm tsx scripts/report/measure-podcast-okcheon.ts --days=14`. 목록 제목이 날짜가 아니라 내용 헤드라인(`podcast_episodes.headline`)인지 — 새 회차가 날짜 제목으로 보이면 codex 헤드라인 생성 실패(크론이 매시 보충, 급하면 `pnpm tsx scripts/once/backfill-podcast-headlines.ts --apply`)
- [ ] `/temperature` · `/forum`
- [ ] `/notices` — 제호 보조설명 "독자를 위한 공고". 게시판 버튼 5개(전체·공지사항·고시공고·입법예고·채용공고, `?board=` 쿼리) → 마감 임박(7일 안·D-day 셀, **남은 3일 이내는 주황**) → 진행 중 → 기간 없는 공고. **마감 지난 공고는 안 보인다**. 날짜는 좌 셀의 "게시 9월" 라벨과 D-day 셀("N일 남음" + 날짜, "마감" 낱말 없음)로 구분하고, 행 메타는 원문 기간 + "원문 ↗"만(**게시자·부서명 없음**). 상단 주황 띠는 전체 보기에서 마감 ≥ 오늘이 있을 때만 — 점선 게이지는 데스크탑(≥1100px)에선 항목 **위**, 모바일에선 항목 **아래**, 경계는 띠 아래 1px 한 줄(항목 사이 실선 없음 — 모바일도)
- [ ] `/notices?board=recruit` — 채용공고만. 마감일은 군청 목록의 '마감일' 칸에서 온다(파싱 아님)
- [ ] `/admin` — 관리자 계정으로 로그인(개발 빌드에서만 `PREVIEW_NO_AUTH=1` 우회 가능, 운영 빌드는 무시). 제호 아래 "지금 처리할 일" 숫자 줄과 검수 큐 괘선 행이 보이고, 항목의 "반려"를 누르면 그때 사유 칸이 펼쳐진다
- [ ] 운영자 계정 발급: `pnpm tsx scripts/ops/create-admin-user.ts --email=<주소> --role=operator_oki|operator_mbc|super_admin --name=<표시이름>` — 역할·소속(app_metadata)을 함께 심고 초기 비밀번호를 한 번만 출력한다(같은 이메일이 있으면 역할·소속만 갱신)

---

## 부록 — 자동화 못 하는 것 (정직한 한계)

`setup-mac.sh`는 **원클릭이 아니다.** 아래는 사람이 해야 한다:
1. **§5 음성 다운로드** — 시스템 설정 UI(자동화 불가)
2. **§6 Codex 로그인** — 브라우저 인증
3. **§3 시크릿** — 보안 채널 이전(자동화하면 유출)
4. **§10 Tunnel 도메인** — Cloudflare 계정 설정

스크립트는 이 지점에서 멈추고 "이제 이걸 하세요"를 출력한다.

## 팟캐 음성 — Gemini TTS(2026-09-08~)
- 1순위 `lib/ai/gemini-tts.ts`(gemini-3.1-flash-tts-preview, 보이스 Kore, 아나운서 지시문) → 실패 시 OpenAI gpt-4o-mini-tts → macOS say. 키는 `GOOGLE_GENERATIVE_AI_API_KEY` 공용, `TTS_PROVIDER=openai` 로 끌 수 있음. PCM 응답을 ffmpeg 로 MP3 변환하므로 ffmpeg 필수.
- 기존 회차 재합성: `pnpm tsx scripts/ops/resynth-podcast-gemini.ts` (dry-run) → `--apply` (기본 9월 1일 이후, `--id=` 한 건, `--test="문장"` 합성만).

## 팟캐 대본 윤문 — im-not-ai 룰북(2026-09-08~)
- `lib/ai/humanize-korean.ts` 가 대본 생성 직후(금칙어 검사 전) 구독 CLI(codex)로 한 번 더 돌려 AI 티(번역투·기계적 대구·상투 관용구·연결어미 쉼표)를 걷어낸다. 룰북은 `lib/ai/humanize/quick-rules.md`(https://github.com/epoko77-ai/im-not-ai , MIT) 그대로 복사. 갱신은 파일만 다시 복사.
- 안전장치: 숫자·고유명사·인용 보존 지시 + 변경률 50%/길이 60~140% 가드(넘으면 초안 유지), CLI 실패 시 초안 유지. 회차당 약 3분 추가.

## 11. 검색 노출 — 서치어드바이저·Search Console 제출 (2026-10-26)

코드가 내는 것: `/robots.txt` `/sitemap.xml` `/news-sitemap.xml` `/feed.xml` `/llms.txt` `/indexnow-key.txt`, 페이지 JSON-LD, canonical. 사람이 한 번 할 일:

1. **네이버 서치어드바이저**(searchadvisor.naver.com, 소유 확인 완료) → 요청 → 사이트맵 제출 `https://mbcok.com/sitemap.xml` · RSS 제출 `https://mbcok.com/feed.xml`. 검증 → robots.txt 수집 요청 한 번. IndexNow 는 `INDEXNOW_KEY`(.env.local)만 있으면 승인 때 자동.
2. **Google Search Console**(DNS TXT 로 소유 확인 완료) → Sitemaps 에 `sitemap.xml` 과 `news-sitemap.xml` 둘 다 제출. URL 검사로 크로스뷰 상세 하나 "색인 생성 요청". 리치 결과 테스트(search.google.com/test/rich-results)로 NewsArticle 확인.
3. Google Publisher Center 등록은 별도 판단(언론사 매체 등록 요건 — 발행처명 "ZONE-2" 를 뉴스 사이트맵과 동일하게).
4. 확인: 서치어드바이저 "콘텐츠 수집 현황"과 Search Console "페이지" 보고서가 1~2주 뒤 채워진다. 방문 통계와 함께 #190 보고에 반영.

제출 이력: 2026-10-26 대표가 서치어드바이저(sitemap.xml·feed.xml)·Search Console(sitemap.xml·news-sitemap.xml) 제출 완료. 같은 날 IndexNow 첫 제출(홈·크로스뷰·팟캐·온도계) 202.

## 12. 백업·복원 (2026-10-27)

운영 DB 는 Supabase CLI 스택(`supabase_db_zone-2`)이라 `supabase db reset` 한 줄이면 전부 지워진다(§4 경고). 그래서 야간 백업을 둔다.

- **잡**: `deploy/launchd/kr.zone2.backup.plist` → `/bin/bash ~/zone2-backups/bin/backup-db.sh` 매일 04:20. 설치·갱신은 `bash scripts/ops/backup-db.sh --install` 한 줄(사본 복사 → plist 의 `__HOME__` 치환 → bootout·bootstrap). 저장소 안의 파일을 직접 돌리지 않는 이유: launchd 가 띄운 `/bin/bash` 는 macOS 폴더 보호(TCC) 때문에 `~/Documents` 를 읽지 못해 "Operation not permitted"(exit 126) 로 끝난다(2026-10-27 확인; `pnpm`/`node` 는 접근 허용을 받아 다른 잡은 멀쩡하다). `scripts/deploy.sh` 가 배포 때 사본이 달라졌으면 자동으로 갱신한다. 로그 `/tmp/zone2-backup.log`, 오류 `/tmp/zone2-backup.err`.
- **산출물**: `~/zone2-backups/db/zone2-db-YYYYMMDD.dump`(pg_dump 사용자 정의 형식, 14일 보존, 약 20MB) · `~/zone2-backups/storage/zone2-storage-YYYYMMDD.tgz`(Storage 볼륨 `/mnt` 전체 — 공론장 사진·팟캐 음성·카드 이미지, 일요일 또는 7일 넘게 없을 때, 4개 보존, 약 850MB). 폴더는 `ZONE2_BACKUP_DIR` 로 바꿀 수 있다.
- **확인**: 관리자 대시보드 「백업」 절(관리자만)에 경로·최신 파일·내려받기 링크가 있고, 마지막 덤프가 30시간을 넘으면 경고가 뜬다. 수동 실행은 `bash scripts/ops/backup-db.sh --storage`.
- **외부 보관**: 이 폴더는 같은 디스크에 있다. 주기적으로 다른 매체(외장 디스크·클라우드)에 복사해 두는 것은 사람이 한다 — 대시보드의 내려받기로 가져가도 된다.

복원(새 머신 또는 사고 뒤). 먼저 §4 대로 빈 스택을 띄우고 마이그레이션을 적용하지 **않은** 상태에서:
```bash
# DB — 스키마·데이터·함수 전부 덤프에 들어 있다(--clean 으로 기존 객체 교체)
docker exec -i supabase_db_zone-2 pg_restore -U postgres -d postgres --clean --if-exists --no-owner --no-privileges < ~/zone2-backups/db/zone2-db-YYYYMMDD.dump
docker exec supabase_db_zone-2 psql -U postgres -c "notify pgrst, 'reload schema'"
# 저장소 — 볼륨에 풀고 storage 컨테이너 재시작
docker exec -i supabase_storage_zone-2 tar xzf - -C /mnt < ~/zone2-backups/storage/zone2-storage-YYYYMMDD.tgz
docker restart supabase_storage_zone-2
```
복원 뒤 `launchctl kickstart -k gui/$(id -u)/kr.zone2.server` 로 앱을 재시작하고 §11 체크리스트를 돈다. 덤프에는 작성자 해시·비밀번호 해시 등 개인정보 파생값이 들어 있으니 내려받은 파일은 암호화된 디스크에만 둔다.
