<!-- Title: [type] summary — type: feat / fix / docs / design / refactor / ops. English or Korean. -->

## What and why / 변경 내용과 이유

## Related issue / 관련 이슈
<!-- Closes #12 -->

## Checklist / 확인
- [ ] `pnpm exec tsc --noEmit -p . && pnpm exec eslint . && pnpm build` pass (same as CI)
- [ ] `docs/` updated in this PR if behavior changed / 동작이 바뀌면 같은 PR 에서 docs 갱신
- [ ] Schema changes are one idempotent file in `supabase/migrations/` / 스키마 변경은 멱등 마이그레이션 한 파일
- [ ] No keys, tokens, peppers, or collected article/comment text in the diff / 비밀값·실데이터 없음
- [ ] AI-generated content still needs a human confirmation before publication / AI 생성물 사람 확인 원칙 유지
- [ ] Authors stay hashed; no new personal data stored / 작성자 해시·개인정보 미저장 유지
- [ ] Region-specific names come from `config/region.ts`, not string literals / 지역 고유 이름은 설정에서

## Screenshots (UI changes) / 스크린샷
