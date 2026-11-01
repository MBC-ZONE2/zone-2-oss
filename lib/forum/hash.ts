// ============================================================================
// lib/forum/hash — 작성자 비식별화 해시
//
// 담당: 통합 공론장(그룹 D).
// 정책: "author는 즉시 해시(author_hash)". 인증 사용자 id 를 그대로 저장하지
//       않고 SHA-256 해시로 비식별화한다. 동일 사용자는 동일 해시(글 연속성).
// 런타임: Web Crypto(globalThis.crypto.subtle) 사용 — Node/Edge/Workers 공용.
// pepper: FORUM_HASH_PEPPER(서버 전용) 가 있으면 결합해 레인보우 테이블을 방지.
// ============================================================================

/** ArrayBuffer → hex 문자열 */
function toHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, "0");
  }
  return out;
}

/**
 * 사용자 식별자를 비식별 해시로 변환한다.
 * 동일 입력 → 동일 출력(결정적)이라 사용자별 글 묶음은 유지하되 원본은 숨긴다.
 *
 * @param userId 인증된 사용자 id (Supabase auth user id 등)
 * @returns 64자 hex SHA-256 해시
 */
/**
 * pepper 해석 (호출 시점).
 * 미설정 시 개발/테스트는 고정 폴백, 프로덕션은 즉시 실패(REQ-017) —
 * 기본값 pepper 로는 레인보우 테이블 방지가 무력화된다.
 * (모듈 로드 시 throw 는 next build 를 깨뜨리므로 호출 시점 검사)
 */
function getPepper(): string {
  const pepper = process.env.FORUM_HASH_PEPPER;
  if (pepper) return pepper;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "FORUM_HASH_PEPPER 가 설정되지 않았습니다 — 운영 환경에서는 필수입니다 (.env.example 참고)",
    );
  }
  return "zone-2-forum";
}

export async function hashAuthor(userId: string): Promise<string> {
  const data = new TextEncoder().encode(`${getPepper()}:${userId}`);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", data);
  return toHex(digest);
}

/**
 * UI 표시용 짧은 라벨. 전체 해시 대신 앞 8자리만 노출한다.
 * 예: "a1b2c3d4" → "익명-a1b2c3d4"
 */
export function shortAuthorLabel(authorHash: string | null): string {
  if (!authorHash) return "익명";
  return `익명-${authorHash.slice(0, 8)}`;
}

/**
 * 실명(소셜 닉네임) 우선 표시 라벨 (F6).
 * displayName 이 있으면 실명, 없으면 익명-{해시8}.
 */
export function authorDisplayLabel(
  authorHash: string | null,
  displayName: string | null,
): string {
  const name = displayName?.trim();
  if (name) return name;
  return shortAuthorLabel(authorHash);
}
