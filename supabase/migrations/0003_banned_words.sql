-- ============================================================================
-- ZONE-2 금칙어 운영 사전 (0003_banned_words)
-- 출처: docs/06-API명세.md §4 — /api/admin/banned-words (GET/POST/DELETE)
--
-- 시드 사전(lib/moderation/banned-words.ts)과 별개로 운영자가 동적으로
-- 관리하는 사전. 공론장 작성 경로에서 moderateText(text, extraDict) 의
-- extraDict 로 주입되어 시드와 합쳐 검사된다.
--   - word   : 소문자 저장 (API 계층에서 toLowerCase 후 insert)
--   - reason : lib/moderation 의 BannedWordReason('hate'|'spam') 과 호환
-- ============================================================================

create table banned_words (
  id          uuid primary key default gen_random_uuid(),
  word        text not null unique,
  reason      text not null check (reason in ('hate', 'spam')),
  created_at  timestamptz default now()
);

-- RLS: 공개 정책 없음 → anon/authenticated 접근 차단.
-- 관리 API(/api/admin/banned-words)와 모더레이션 로더는 service_role 로 접근한다.
alter table banned_words enable row level security;
