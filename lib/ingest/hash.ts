// ============================================================================
// lib/ingest/hash — 댓글 작성자 비식별화 해시
//
// docs/04: comments.author_hash 는 원본 작성자 식별자를 비식별화한 값이다.
// 어댑터가 넘긴 authorRaw 를 즉시 해시화하여 원본을 저장하지 않는다.
// ============================================================================

import { createHash } from "node:crypto";

/**
 * 해시 솔트 해석 (호출 시점, 메모이즈).
 * - 환경변수 INGEST_HASH_SALT 가 있으면 사용.
 * - 없으면: 개발/테스트는 고정 폴백(결정적 동작 보장),
 *   프로덕션은 즉시 실패 — 기본값 솔트로 해시되면 비식별화 강도가
 *   무력화되므로 배포 설정 누락을 조기에 드러낸다(REQ-017).
 * 모듈 로드 시점이 아니라 호출 시점에 검사하는 이유: next build 가
 * NODE_ENV=production 으로 라우트를 import 하므로 로드 시 throw 는
 * 빌드를 깨뜨린다.
 */
let cachedSalt: string | null = null;

function getHashSalt(): string {
  if (cachedSalt) return cachedSalt;

  const salt = process.env.INGEST_HASH_SALT;
  if (salt) {
    cachedSalt = salt;
    return cachedSalt;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "INGEST_HASH_SALT 가 설정되지 않았습니다 — 운영 환경에서는 필수입니다 (.env.example 참고)",
    );
  }
  cachedSalt = "zone2-ingest-default-salt";
  return cachedSalt;
}

/**
 * 작성자 식별자를 SHA-256 해시로 비식별화한다.
 *
 * - 같은 작성자는 같은 해시(중복 식별 가능), 원본은 복원 불가.
 * - authorRaw 가 없으면 null 을 반환한다.
 *
 * @param authorRaw 어댑터가 넘긴 원본 작성자 식별자
 * @returns 64자 hex 해시 또는 null
 */
export function hashAuthor(authorRaw: string | undefined | null): string | null {
  // 솔트 검증을 데이터 유무보다 먼저 수행한다 — authorRaw 가 비어 있는
  // 호출에서도 프로덕션 설정 누락(fail-fast)이 드러나야 한다.
  const salt = getHashSalt();

  const trimmed = authorRaw?.trim();
  if (!trimmed) return null;

  return createHash("sha256")
    .update(`${salt}:${trimmed}`)
    .digest("hex");
}
