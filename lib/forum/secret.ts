// ============================================================================
// lib/forum/secret — 비번 해시(PBKDF2) + IP 해시(SHA-256+pepper)
//
// 로그인 없는 익명 글쓰기 정책(2026-09):
//   * 작성 시 4자리+ 비밀번호를 받아 PBKDF2로 해시 저장 → 수정/삭제 시 검증.
//   * IP는 원문 저장하지 않고 pepper 결합 SHA-256 해시로만 저장(어뷰징 판별용).
// 런타임: Web Crypto(globalThis.crypto.subtle) — Node/Edge 공용. 외부 의존성 없음.
// ============================================================================

const PBKDF2_ITERATIONS = 120_000;
const SALT_BYTES = 16;
const KEY_BITS = 256;

function toHex(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, "0");
  return out;
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

/** 서버 전용 pepper — 기존 포럼 해시와 동일 정책(운영 필수). */
function getPepper(): string {
  const pepper = process.env.FORUM_HASH_PEPPER;
  if (pepper) return pepper;
  if (process.env.NODE_ENV === "production") {
    throw new Error("FORUM_HASH_PEPPER 가 설정되지 않았습니다 — 운영 환경 필수");
  }
  return "zone-2-forum";
}

/** 비밀번호 정책: 4자리 이상. 통과 못 하면 사유 반환. */
export function validatePassword(pw: unknown): { ok: boolean; message?: string } {
  if (typeof pw !== "string") return { ok: false, message: "비밀번호가 필요합니다." };
  if (pw.length < 4) return { ok: false, message: "비밀번호는 4자 이상이어야 합니다." };
  if (pw.length > 128) return { ok: false, message: "비밀번호가 너무 깁니다." };
  return { ok: true };
}

async function pbkdf2(password: string, salt: Uint8Array): Promise<string> {
  const enc = new TextEncoder();
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    enc.encode(`${getPepper()}:${password}`),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  // salt를 전용 ArrayBuffer 뷰로 복사(SharedArrayBuffer 타입 이슈 회피).
  const saltBuf = new Uint8Array(salt.length);
  saltBuf.set(salt);
  const bits = await globalThis.crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: saltBuf, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    key,
    KEY_BITS,
  );
  return toHex(bits);
}

/** 비번 → 저장용 해시 문자열 "pbkdf2$<iter>$<saltHex>$<hashHex>". */
export async function hashPassword(password: string): Promise<string> {
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await pbkdf2(password, salt);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toHex(salt)}$${hash}`;
}

/** 입력 비번이 저장 해시와 일치하는지(상수시간 비교). */
export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const salt = fromHex(parts[2]);
  const expected = parts[3];
  const actual = await pbkdf2(password, salt);
  // 상수시간 비교
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

/** IP → pepper 결합 SHA-256 해시(원문 IP 저장 안 함). 미상 IP는 null. */
export async function hashIp(ip: string | null | undefined): Promise<string | null> {
  const clean = ip?.trim();
  if (!clean) return null;
  const data = new TextEncoder().encode(`${getPepper()}:ip:${clean}`);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", data);
  return toHex(digest);
}

/**
 * 요청 헤더에서 클라이언트 IP 추출.
 * 신뢰 순서: Cloudflare 터널이 붙이는 cf-connecting-ip → X-Forwarded-For 의 **마지막** 값
 * (프록시가 덧붙인 신뢰 홉; 첫 값은 클라이언트가 임의로 넣을 수 있어 60초 제한 우회에 쓰인다)
 * → x-real-ip. 아무것도 없으면 null(호출측이 전역 버킷 등으로 보완).
 */
export function clientIpFrom(headers: Headers): string | null {
  const cf = headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf;
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const hops = xff.split(",").map((v) => v.trim()).filter(Boolean);
    if (hops.length > 0) return hops[hops.length - 1];
  }
  return headers.get("x-real-ip")?.trim() || null;
}
