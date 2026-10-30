# 06. API 명세

> 병렬 개발의 공통 계약. 모든 모듈은 이 명세를 기준으로 구현한다.

---

## 1. 매체 어댑터 인터페이스 (Core 확장점)

Core는 특정 매체를 모른다. 어댑터를 주입받는다.

```ts
// lib/adapters/types.ts
export type MediaTier = 'macro' | 'micro';     // 광역 / 기초

export interface RawArticle {
  externalId: string;
  url: string;
  title: string;
  body: string;
  category?: string;
  keywords?: string[];
  publishedAt: string;        // ISO
  raw?: unknown;
}

export interface RawComment {
  externalId: string;
  articleRef: string;          // 원본 기사/영상 식별자
  body: string;
  authorRaw?: string;          // 어댑터가 넘기되, Core가 즉시 해시화
  likeCount?: number;
  publishedAt: string;
}

export interface MediaSourceAdapter {
  id: string;                  // 'mbc_cb' | 'okinews' | 'demo'
  tier: MediaTier;
  fetchArticles(since: Date): Promise<RawArticle[]>;
  fetchComments(articleRef: string): Promise<RawComment[]>;
}

// lib/adapters/registry.ts — config로 주입 (Deploy가 실제 어댑터 등록)
export const adapters: MediaSourceAdapter[] = [/* DemoAdapter (Core) / MbcAdapter·OkinewsAdapter (Deploy) */];
```

---

**범용 RSS 어댑터**(`lib/adapters/rss.ts`, 2026-10-26, #184): `RSS_MACRO_FEED_URL`/`RSS_MICRO_FEED_URL` 이 있으면 `createRssAdapter` 가 계층별로 레지스트리에 올라간다. RSS 2.0·Atom 을 의존성 없이 파싱, 본문은 1,500자 요약까지, external_id `rss-<sha1 16>`, 댓글 없음. 다른 지역판의 기본 수집 경로.

## 2. 공통 규약

| 항목 | 규칙 |
|------|------|
| 응답 포맷 | `{ data, error }` — 성공 시 `error: null` |
| 에러 | `{ error: { code, message } }`, HTTP 4xx/5xx |
| 페이지네이션 | cursor 기반 `?cursor=&limit=` (기본 20) |
| 공개 GET 인증 | Supabase anon (RLS로 `approved`/`published`만) |
| 관리자 인증 | Supabase Auth 세션 + role(`super_admin`/`operator_*`) |
| Cron 인증 | 헤더 `Authorization: Bearer $CRON_SECRET` |
| 시각 | 모든 timestamp UTC ISO-8601 |

---

## 3. 공개 API

| 메서드 | 경로 | 설명 | 응답 |
|--------|------|------|------|
| GET | `/api/crossview` | 크로스뷰 페어 목록(approved) | `CrossviewPair[]` |
| GET | `/api/crossview/[id]` | 페어 상세(요약·카드) | `CrossviewPair` |
| GET | `/api/temperature` | 현재 TOP-N + 최신 온도 (`?limit=` 1~20, 기본 5 — 온도계 화면 라이브 갱신은 12) | `TemperatureBoard` |
| GET | `/api/temperature/[issueId]` | 이슈 온도 추이 + 7일 감정 분포 (`?limit=` 최근 포인트 수, 기본 96·최대 800) — `?fields=trend` 면 감정 분포 스캔을 건너뛴 `{ trend }` 축약(온도판 7일 잔상용). 응답 `Cache-Control: private, max-age=300` | `{ trend: TemperaturePoint[], sentimentDist: {pos,neu,neg} }` |
| GET | `/api/podcast` | 에피소드 목록(published) — `?fields=list` 면 script 등 뺀 축약(`id·title·audioUrl·durationSec·publishedAt` + `lead` + `headline`, 전역 플레이어 큐용(네비 재생 원 최신 회차·자동 다음 회차)). `lead` = 대본에서 뽑은 대표 문장 60자(`lib/podcast/script.episodeLead`, 못 뽑으면 `""`). `headline` = 표시용 내용 요약 헤드라인 40자(`podcast_episodes.headline` — 회차 생성 때 codex 가 지음(`lib/ai/podcast-headline`), 없으면 `lib/podcast/script.episodeHeadline` 휴리스틱, 그래도 없으면 `title`; 예: `"2억 원 수표 노린 보이스피싱, 수거책 붙잡아 회수"`) — 피그마 코멘트 #4(2026-09-11) 로 화면 제목이 날짜(`title`) 대신 이 값이 되었다. `title`(=DB `episodes.title`) 은 그대로 내려간다(회차 식별) | `Episode[]` |
| GET | `/api/podcast/[id]` | 에피소드 상세(오디오·스크립트) | `Episode` |
| GET | `/api/forum` | 게시글 목록(cursor) — `?issueHeads=1` 이면 `{ posts, issueHeads }`(그 페이지 기사별 크로스뷰 헤드) | `ForumPost[]` |
| GET | `/api/forum/captcha` | 자동등록방지 문제 발급 `{ token, question: "3 + 4" }`(2026-10-19, `lib/forum/captcha` — HMAC 서명·10분 만료·발급 3초 뒤부터·1회 사용) | `{ token, question }` |
| POST | `/api/forum/image` | 글 사진 1장 업로드(multipart `file`, 이미지 5MB 이하) → sharp 1600px·WebP → `forum` 버킷 공개 URL. IP 분당 6장 | `{ url }` |
| POST | `/api/forum` | 게시글 작성(익명·비밀번호 4자+, IP 60초 제한). 본문에 `captcha: { token, answer }` 필수, `imageUrl`(우리 버킷 URL 만)·`website`(honeypot, 비어 있어야 함) 선택 | `ForumPost` |
| GET | `/api/forum/[id]` | 게시글 + 댓글 | `ForumPostDetail` |
| POST | `/api/forum/[id]/comments` | 댓글 작성(익명·비밀번호 4자+). `captcha` 필수, `website` honeypot | `ForumComment` |
| POST | `/api/visit` | 하루 1회 익명 방문 신호 `{ id: UUID, path }`(#181). 서버는 `sha256(id+VISIT_HASH_PEPPER)`·KST 날짜·첫 경로만 `site_visits` 에 남긴다. 봇 UA·`/admin`·IP 분당 30회 초과·pepper 미설정은 무시. 180일 보존 정리는 `site_visits_prune()`(0029) — 지우기 전에 일별 집계를 먼저 채운다. 항상 204 | (없음) |
| GET | `/api/visit/stats` | 오늘·누적 방문자 수 `{ today, total, since, todayDate }`(2026-10-26 대표 지시). 서버 60초 캐시(`lib/visits/counters` → DB 함수 `visit_counters()` 0029). 누적 = `site_visits_daily` 일별 순방문자 합 + 오늘(180일 보존 후에도 줄지 않게). 푸터 `components/visit-counter` 와 관리자 대시보드가 쓴다. 못 가져오면 503 | (없음) |
| GET | `/robots.txt` | `app/robots.ts` — 전부 허용, `/admin`·`/api/admin`·`/api/cron`·`/api/visit`·`/api/forum`·`/login`·`/auth`·`/embed` 제외, 사이트맵 2개 선언. Cloudflare 가 Content-Signal(AI 학습 금지) 블록을 앞에 붙인다(2026-10-26 SEO) | (없음) |
| GET | `/sitemap.xml` | 정적 8 + 공개 크로스뷰·팟캐·온도 사안·공론장 글(`lib/seo/urls`, 10분 캐시) | (없음) |
| GET | `/news-sitemap.xml` | Google News 사이트맵 — 최근 2일 안에 **공개된**(크로스뷰 `published_at` 0030 트리거 = 첫 승인 시각, 팟캐 `published_at`) 건만, 최대 1,000, 발행처 "ZONE-2"/ko | (없음) |
| GET | `/feed.xml` | RSS 2.0 최신 50(크로스뷰+팟캐, 팟캐는 enclosure) — 네이버 서치어드바이저 RSS 제출용 | (없음) |
| GET | `/llms.txt` | 생성형 검색용 사이트 설명·인용 방법·기계 판독 URL(정적) | (없음) |
| GET | `/indexnow-key.txt` | IndexNow 키 파일(`INDEXNOW_KEY`, 없으면 404). 검수 승인으로 공개되는 크로스뷰·팟캐 URL 을 `POST /api/admin/moderate` 가 `api.indexnow.org` 에 알린다 | (없음) |

실시간: 온도계는 **Supabase Realtime** 채널 `temperature_scores` 구독(15분 갱신 push).

---

## 4. 관리자 API (인증 + role)

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/admin/queue?type=crossview\|podcast\|forum` | 검수 대기 목록. 응답 `{ type, items, nextCursor, viewer }` — `viewer = { role, org, canConfirmBoth, canModerate }`(요청자가 어느 소속으로 확인할 수 있는지). 크로스뷰·팟캐스트 항목은 `meta.confirmations = { okinews, mbc }`(확인 시각 또는 null) 포함 |
| POST | `/api/admin/moderate` | `{ target, targetId, action: 'approve'\|'reject'\|'edit_approve', reason?, edits?, org? }` |
| POST | `/api/admin/moderate/bulk` | `{ items: [...] }` 최대 20건 일괄. 항목 결과에 `published`(이중 컨펌 발행 여부) 포함 |
| GET/PATCH | `/api/admin/users` | 계정 역할·소속 관리. PATCH `{ userId, role, org? }` — `org` 는 기자 역할에서만 유효(생략 시 역할 기본값) |
| POST | `/api/admin/match-rule` | 수동 매칭 룰 추가 |
| GET/POST/DELETE | `/api/admin/banned-words` | 금칙어 사전 관리 |
| GET | `/api/admin/backups` | 야간 백업 현황(폴더 경로·최신 DB 덤프·최신 저장소 묶음·보관 수·합계). 권한 `system.config`(관리자). 파일은 `scripts/ops/backup-db.sh`(launchd `kr.zone2.backup` 매일 04:20)가 만든다 |
| GET | `/api/admin/backups/download?kind=db\|storage&name=` | 백업 파일 내려받기(스트리밍). 이름은 `zone2-db-YYYYMMDD.dump` / `zone2-storage-YYYYMMDD.tgz` 형식만, 경로는 서버가 백업 폴더 안에서만 만든다. 권한 `system.config` |
| GET | `/api/admin/metrics?period=oct\|report2w\|reportcum\|pilot\|30d&format=json\|csv` | 검증지표 보고서(#181) — `/admin/metrics` 와 같은 `lib/metrics.buildMetricsReport`. `format=csv` 는 결과보고서용 내려받기. 권한 `logs.view` |

모든 액션 → `moderation_logs` 기록. `GET /api/admin/logs?action=` 은
`approve | reject | edit_approve | confirm | auto_publish | all` (`auto_publish` = 팟캐 검수 마감 자동 공개, 사람 승인 아님 — 승인율 집계 제외, 0023 · #185).

### 4.1 확인 규칙 (회의 결정 [9] 이중 컨펌 → 2026-10-29 한쪽 확인 즉시 공개)

콘텐츠 발행에 필요한 확인 수는 `REQUIRED_CONFIRMATIONS`(lib/auth/roles) 하나로 정한다. **운영 mbcok.com 은 2026-10-29 부터 1 — 옥천신문·MBC충북 중 어느 한쪽이 확인하면 그 자리에서 공개**된다(대표 결정 "양사 중 한 곳이 컨펌하면 바로 노출"). **공개 배포판(export-oss.sh)은 2 — 양측 확인이 끝나야 공개**(대표 2026-10-29 "오픈소스에 올릴 것은 양사 컨펌"); 그때는 아래의 양측 확인 흐름이 그대로 산다. 확인 기록·소속·에러 코드는 값과 무관하게 같다.

- 대상: **크로스뷰·팟캐스트만.** 공론장(forum) 게시물·댓글 모더레이션과 온도계는
  기존 단일 승인 그대로다.
- 저장 위치: `crossview_pairs.confirmations` / `podcast_episodes.confirmations`
  (`0017_dual_confirm`, jsonb) — `{"okinews":{"by":<uuid>,"at":<iso>},"mbc":{…}}`.
- 기록 방식: **RPC `confirm_content(p_table, p_id, p_org, p_by, p_reset_others)`**
  (`0019_confirm_content_rpc`, `security definer`, service_role 전용).
  확인 병합을 **한 UPDATE 문 안에서** 처리해 양측이 동시에 확인할 때 나중 쓰기가
  상대 확인을 지우는 lost update 를 막는다. 서버는 이 RPC 가 돌려준 confirmations
  로만 발행 여부를 판정하고, `confirmations` 를 다시 쓰지 않는다.
  RPC 는 검수 큐 상태(crossview=`candidate`, podcast=`review`)의 행만 갱신하며,
  큐 밖이면 `null` → `NOT_IN_QUEUE`(409). 허용 테이블·소속 밖의 인자는 예외.
- 소속(org) SSOT: `auth.users.app_metadata.org` = `'okinews' | 'mbc' | null`.
  `super_admin` 은 소속 없이 양쪽을 확인할 수 있어 요청에 `org` 를 **필수**로 넣는다.
  기자 역할은 자기 소속으로만 확인한다(`org` 생략 가능, 다르면 `ORG_MISMATCH`).
  `app_metadata.org` 가 비어 있으면 역할에서 유추한다(`operator_mbc`→`mbc`,
  `operator_oki`→`okinews`) — 마이그레이션 전 계정 하위호환.
- `approve` / `edit_approve` 응답(**운영 REQUIRED_CONFIRMATIONS=1**): 첫 확인이 곧 승인 전이(approved/published) → `{ statusUpdated: true, confirmed: ['mbc'], pending: ['okinews'], published: true }`. 로그는 `approve`/`edit_approve`(승인율 포함). `pending` 은 아직 확인하지 않은 쪽의 표시용일 뿐 발행을 막지 않는다.
- (REQUIRED_CONFIRMATIONS=2 — 공개 배포판 기본) 한쪽만 확인 → status 유지(candidate/review), `{ statusUpdated: false, confirmed: ['okinews'], pending: ['mbc'], published: false }`; 양쪽 확인 완료 → 승인 전이, `published: true`.
- (REQUIRED_CONFIRMATIONS=2 일 때) **한쪽 확인 후 `CONFIRM_TIMEOUT_HOURS`(기본 3)시간이 지나면 상대 확인 없이 자동 공개**(대표 결정 2026-10-26, DB 함수 `auto_publish_single_confirmed(p_hours)` 0031 — 행 잠금 후 재판정·전이·로그를 한 트랜잭션에서; `lib/moderation/confirm-timeout` 이 `/api/cron/temperature` 15분마다 호출). 아무도 확인하지 않은 행은 대상이 아니다. 감사 로그 `auto_publish` + `details.autoPublish.reason=single_confirm_timeout`(승인율 제외). 관리자 큐 칩에 "자동 공개 HH:MM" 예고. `0|off` 면 종전대로 양측 필수.
- 같은 소속의 재확인은 시각만 갱신한다(중복 아님).
- `edit_approve` 로 **본문이 실제로 바뀌면 상대 소속의 확인은 무효**가 된다
  (상대가 못 본 내용이 발행되는 것을 막는다).
- `reject` 는 이중 컨펌 대상이 아니다 — 즉시 반려하고 `confirmations` 를 비운다.
  롤백(발행→검수)도 `confirmations` 를 비워 다시 확인(기본 한쪽)을 받는다. **되돌리기 자체는 한쪽 단독**
  (`POST /api/admin/content/rollback`, 권한 `content.rollback` = 관리자·옥천신문·MBC충북 기자, 2026-10-19 대표 지시) —
  감사 로그 `details.by` 에 소속(okinews/mbc/admin)을 남긴다. 운영 대시보드 → 콘텐츠 관리 탭 → 발행 항목의 "되돌리기".
- 에러 코드: `ORG_REQUIRED`(소속 미지정/미선택), `ORG_MISMATCH`(타 소속 대행 시도),
  `NOT_IN_QUEUE`(대상이 없거나 이미 처리됨, 409), `CONFIRM_WRITE_FAILED`(확인 기록 실패, 500).
- 감사 로그 액션 구분(`moderation_logs.action`, `0019` 에서 enum 에 `confirm` 추가):
  - 확인했지만 아직 미발행(REQUIRED_CONFIRMATIONS=2 의 한쪽 확인) → **`confirm`**(감사 로그 UI 라벨 "기관 확인"). 기본값 1 에서는 생기지 않는다
  - 실제 발행 전이 → 기존대로 `approve` / `edit_approve`
  - 반려·롤백 → `reject`
  승인율(`approve/(approve+reject)`, docs/02 §지표)이 미발행 후보로 부풀지 않게
  하기 위한 구분이다. `/api/admin/logs?action=confirm` 으로 따로 조회할 수 있다.
  응답의 `action` 은 **요청 액션 그대로** 돌려준다(로그 액션과 다를 수 있음).
- 감사 로그 details: `moderation_logs.details.confirm = { org, confirmed, pending, published, resetOthers }`.
- 로그 기록이나 상태 전이가 실패하면 RPC 가 쓴 확인 기록도 되돌린다
  (확인만 남고 로그가 없는 상태를 만들지 않는다).

---

## 5. Cron Workers (CRON_SECRET)

| 경로 | 스케줄 | 동작 |
|------|--------|------|
| `/cron/ingest` | 매시 | 어댑터 수집 → 정규화 → 임베딩 → 적재 |
| `/cron/match` | ingest 후 | pgvector 후보 → Claude 재랭킹 → 요약 → `crossview_pairs(candidate)` |
| `/cron/temperature` | 15분 | 감정·집계 → 온도 산출 → `temperature_scores` + `temperature_runs`(`stats` jsonb: 이슈·여론 매칭·감정 분류 건수·경로). 분류 경로 이상이면 `system_alerts(sentiment_fallback)` |
| `/cron/podcast` | 매시 호출 · KST 07시에만 생성 | 수집 → 스크립트 → QA → TTS → 저장 → 검수 큐(review). 다른 시각은 헤드라인 보충, **정오 이후는 검수 마감 자동 공개**(`PODCAST_AUTO_PUBLISH_HOUR` 에 시각을 명시했을 때만 — 기본은 off. 반려 없으면 확인 없이 공개, `moderation_logs.details.autoPublish`) **+ 무발행·검수 대기 감지**(`podcast_missing_day` / `podcast_pending_review` / `podcast_auto_published`, lib/podcast/health) |

---

## 6. 외부 API 연동

| 서비스 | 용도 | 호출 | 경유 |
|--------|------|------|------|
| Claude | 재랭킹·요약·감정·스크립트·모더레이션 | messages API | Cloudflare AI Gateway |
| OpenAI | 임베딩 / TTS | `text-embedding-3-small` / `gpt-4o-mini-tts` | AI Gateway |
| YouTube Data API v3 | 영상 댓글 | `commentThreads.list` | 직접 |

---

## 7. AI 함수 시그니처 (`lib/ai`)

```ts
embed(texts: string[]): Promise<number[][]>;                       // OpenAI
rerankMatches(macro: Article, candidates: Article[]): Promise<{id: string; score: number}[]>;  // Claude
summarizeCrossview(macro: Article, micro: Article): Promise<{ macro: string; micro: string; readingPoint: string }>;
classifySentiment(texts: string[]): Promise<('pos'|'neg'|'neu')[]>; // Claude (배치)
generatePodcastScript(input: PodcastInput): Promise<{ title: string; script: string }>;
synthesizeSpeech(script: string): Promise<ArrayBuffer>;            // OpenAI TTS
moderateContent(text: string): Promise<{ flagged: boolean; reason?: string }>;
```

모든 AI 호출: AI Gateway 경유, 타임아웃·재시도·캐싱 적용.
