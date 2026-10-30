# 데이터 소스·크롤러

ZONE-2의 모든 화면은 실제 충북·옥천 데이터로 채워집니다. 수집기(크롤러)는 `scripts/`에 있습니다.

## 현재 가동 중인 소스

| 소스 | 수집 대상 | 저장 | 크롤러 |
|------|-----------|------|--------|
| **옥천신문** | 기사(1년 아카이브) | `articles` (okinews·news) | `scrape-okinews-archive.ts` |
| **MBC충북** | 옥천 키워드 기사 | `articles` (mbc_cb·news) | `scrape-mbc-archive.ts` |
| **옥천신문 여론광장** | 주민 여론 글 | `comments` / `forum_posts` | `scrape-okinews-forum.ts` |
| **옥천군청 고시·공고** | 지원사업·모집·공고 | `articles` (oc_gov·notice·`category='공고'`) | `scrape-oc-notices.ts` |

## 옥천군청 공고

옥천군청 [고시/공고 게시판](https://www.oc.go.kr/www/selectBbsNttList.do?key=236&bbsNo=40)을 매일 수집합니다.

```bash
pnpm tsx scripts/scrape/scrape-oc-notices.ts [lookbackDays=60] [maxPages=20]
```

- `articles`에 `source='oc_gov'`, `kind='notice'`, `category='공고'`로 적재(멱등 upsert)
- `kind='notice'`라 **크로스뷰(뉴스 매칭)에서 제외**되고, 온도 이슈 생성에서도 제외
- 매일 **19:00 KST** launchd 자동 실행(`kr.zone2.oc-notices`)

## 확장 로드맵

주민 대상 생활정보/혜택 소스를 단계적으로 확장합니다.

- **Phase 1 (현재)**: 옥천군청 고시·공고
- **Phase 2**: 충북 고시공고 + 옥천군청 자유게시판(민원)
- **Phase 3**: 정부24·복지로·기업마당 (옥천/충북 필터)

## 개인정보

여론·민원 글의 작성자는 **수집 즉시 SHA-256 해시**로 저장하고 원본은 저장하지 않습니다. 여론광장은 컨소시엄 합의(협의 영역)를 전제로 수집합니다.

서비스 이용 통계(방문자 수·재방문율)를 위해 브라우저 저장소에 **무작위로 만든 식별 불가 값** 1개를 보관합니다. 이 값은 이름·연락처·IP 등 어떤 개인정보와도 연결되지 않으며, 서버에는 한 번 더 변환(해시)한 값과 방문 날짜, 그날 처음 연 화면의 구역(홈·공론장·팟캐스트 등, 개별 글은 아님)만 하루 1건 저장되며 **180일이 지나면 삭제**됩니다. IP 주소·브라우저 정보·쿠키는 저장하지 않습니다. 브라우저 저장소를 지우면 새 값이 만들어집니다(작성자 해시 정책과 동일한 비식별 원칙).
