# config/ — 지역판 설정

`region.ts` 한 파일이 "옥천판"에만 해당하는 값의 단일 출처다. 다른 지역의 광역 방송 × 기초 신문 조합이 ZONE-2 를 가져다 쓸 때 **이 파일만** 바꾸면 화면·대본·프롬프트·메타데이터·RSS·구조화 데이터에 모두 반영된다.

| 묶음 | 무엇 | 예 |
|---|---|---|
| `site` | 서비스 이름·태그라인·설명·URL·언어 | `name: "ZONE-2"` |
| `place` | 기초 지명·행정구역·광역 지명·지역 소식 판정 낱말 | `name: "옥천"`, `province: "충북"`, `regionWords: [...]` |
| `outlets.macro` / `outlets.micro` | 두 매체 — 표시 이름·계층(광역/기초)·성격(방송/지면)·공식 홈·로고·발행 주기 메모 | `name: "MBC충북"` / `name: "옥천신문"` |
| `government` | 공고 출처(지자체) | `name: "옥천군청"` |
| `podcast` | 시리즈 이름·기초 코너 이름·코너 첫 문장 | `seriesName: "오늘의 충북"` |
| `consortium` · `funder` | 컨소시엄 표기·재단 표기 문장·CI | `funder.name: "한국언론진흥재단"` |

## 바꾸지 않는 것
- **DB 식별자** `source`(`mbc_cb`·`okinews`·`oc_gov`)와 **확인 기관 키** `org`(`mbc`·`okinews`), **역할 이름**(`operator_mbc`·`operator_oki`) — 데이터·마이그레이션에 박힌 키다. 다른 지역판도 키는 그대로 두고 `name` 만 바꾼다(예: `macro.name = "KBS전주"`).
- 수집은 `RSS_MACRO_FEED_URL`/`RSS_MICRO_FEED_URL`(범용 RSS 어댑터)로 시작하고, 피드가 없는 매체는 `lib/adapters/` 인터페이스로 어댑터를 추가한다([README "다른 지역에서 쓰려면"](../README.md)).
- 한국어 문장 규칙(전국 정치 낱말, 앵커 대본 표식 등)은 언어 종속이라 `lib/podcast/regional.ts` 에 남아 있다.

## 공개 리포에서 꺼져 있는 것
`site.intro=false`(홈 인트로 캔버스 영상 코드는 컨소시엄 저작물이라 미포함 — `components/reels/concept-video/IdeaConceptVideo.jsx` 는 빈 스텁), `site.brandVideo=null`, `funder.ci=null`(재단 CI 는 상표라 미포함, 이름 글자로 표기). 자기 지역판의 인트로·영상·후원 표기를 넣으려면 이 값을 채우면 된다.

## 로고 교체
`public/logos/` 에 자사 로고를 넣고 `outlets.*.logo`, `funder.ci` 경로를 바꾼다. 기본 포함된 MBC충북·옥천신문·한국언론진흥재단 로고는 각 기관의 상표로 Apache-2.0 라이선스 대상이 아니다(`NOTICE`).
