<script setup>
// 도메인 토폴로지 데이터 — 현재 운영 구조 기준.
const topoClient = { icon: "👥", title: "사용자 · 브라우저", note: "HTTPS 요청" };
const topoHub = {
  icon: "☁️",
  title: "Cloudflare Named Tunnel ",
  name: "zone2",
  note: "self-host(Mac Mini) 내부 포트로 라우팅 (포트는 예시·수시 변경)",
};
const topoNodes = [
  { icon: "🟦", domain: "mbcok.com", role: "메인 서비스", note: "공개 프론트", canonical: true },
  { icon: "🔁", domain: "www.mbcok.com", role: "301 리다이렉트", note: "정본 통일", redirect: "mbcok.com" },
  { icon: "🔐", domain: "auth.mbcok.com", role: "self-host Supabase Auth", note: "로그인" },
  { icon: "📘", domain: "docs.mbcok.com", role: "문서 사이트", note: "이 사이트" },
];
</script>

# 배포·운영 개요

운영은 **Mac Mini self-host**에서 이뤄집니다. 재부팅에도 자동 복구되도록 전부 launchd로 관리합니다.

::: info 상세 런북
구체적인 운영 명령(크론 호출·DB 점검·재기동 등)은 **팀 내부 문서**(레포 `docs/deploy/`)에 있습니다. 이 페이지는 고수준 개요만 다룹니다.
:::

## 도메인 구조

<DomainTopology :client="topoClient" :hub="topoHub" :nodes="topoNodes" />

Cloudflare **Named Tunnel `zone2`** 하나가 여러 서브도메인을 self-host(Mac Mini) 내부 포트로 라우팅합니다. DNS·라우팅은 Cloudflare가 원격 관리합니다.

## 자동 운영(launchd)

재부팅·로그아웃에도 자동 복구되는 백그라운드 잡으로 전 파이프라인이 돌아갑니다.

| 역할 | 주기 |
|------|------|
| 실앱 서버 | 상시 |
| 터널 커넥터 | 상시 |
| 베타·문서 정적서버 | 상시 |
| 뉴스·여론 수집 | 매시 |
| 온도 산출 | 15분 |
| 팟캐스트 발행 | 매일 아침 |
| 옥천군청 공고 수집 | 매일 저녁 |

## 정적 사이트 재배포

베타·문서는 빌드 후 동기화하면 즉시 반영됩니다.

```bash
sh beta-web/deploy-local.sh    # 베타(mbcok.com)
sh docs-site/deploy-local.sh   # 문서(docs.mbcok.com)
```

## 개발 → 배포 플로우

1. 브랜치 작업 → `pnpm typecheck && pnpm build`
2. PR 생성 → 리뷰 → `main` 머지
3. 운영 반영: `git pull` 후 필요 시 재빌드·재기동
