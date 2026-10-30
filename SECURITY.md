# 보안 정책 (Security Policy)

> **English.** Please do **not** open a public issue for a vulnerability. Report it privately through the repository's *Security* tab → *Report a vulnerability*, with the affected area, reproduction steps, and a proof of concept if you have one. Areas we treat as highest priority: any path that publishes AI-generated content without a human confirmation; authentication or row-level-security bypass; exposure of personal data (de-anonymizing `author_hash`); leaked keys; and tampering with CrossView matches or podcast scripts, including prompt injection. We confirm receipt promptly on business days, reproduce, fix, and agree a disclosure date with you before releasing the patch. Only the `main` branch is supported.

## 취약점 신고
보안 취약점은 **공개 이슈로 등록하지 마세요.** 비공개로 신고해 주시기 바랍니다.

- **GitHub Security Advisory**: 저장소 `Security` 탭 → *Report a vulnerability* (권장)
- 공개 이슈에는 취약점 세부를 적지 마세요 — 위 비공개 신고를 쓰세요.

신고 시 다음을 포함해 주세요: 영향 범위, 재현 단계, 가능한 PoC.

## 중점 점검 범위
ZONE-2의 특성상 다음 영역을 우선 점검합니다.
- **AI 생성물 검수 우회** — 운영자 승인 없이 콘텐츠가 게시되는 경로
- **인증/권한(RLS) 우회** — 관리자/운영자 권한 상승, 비인가 데이터 접근
- **개인정보 노출** — 댓글 작성자 비식별(`author_hash`) 우회, PII 유출
- **시크릿/키 노출** — API 키(Claude/OpenAI/YouTube), Supabase 서비스 키
- **콘텐츠 무결성** — 크로스뷰 매칭/팟캐스트 스크립트 변조, 프롬프트 인젝션

## 대응 절차
1. 신고 접수 확인 (영업일 기준 신속히)
2. 영향 분석 및 재현
3. 수정 및 검증
4. 공개 일정 협의 후 패치 배포

## 지원 범위
현재 활발히 유지되는 `main` 브랜치를 대상으로 합니다.
