// ============================================================================
// lib/forum/captcha — 자동등록방지 (대표 지시 2026-10-19)
//
// 외부 서비스 없이 서버가 내는 덧셈 문제 + 서명 토큰. 흐름:
//   GET /api/forum/captcha → { token, question: "3 + 4" }  (토큰 = payload.sig, HMAC-SHA256(pepper))
//   글·댓글 POST 에 { captcha: { token, answer } } 동봉 → 서버가 서명·만료(10분)·최소 경과(3초)·정답·1회 사용을 확인.
// 봇 1차 방어선: 정답 없이 못 올리고, 토큰 발급 3초 안의 제출(스크립트)·재사용은 거절. 숨은 칸(website, honeypot)에
// 값이 있으면 봇으로 본다. 완벽한 캡차는 아니지만(OCR 불필요한 평문 수식) 폼을 긁어 자동 등록하는 흔한 봇은 막는다.
// Web Crypto 만 사용(Node/Edge 공용). 사용 토큰은 메모리에 기억한다(단일 인스턴스 서버).
// ============================================================================

const TOKEN_TTL_MS = 10 * 60_000;
const MIN_ELAPSED_MS = 3_000;
const USED_MAX = 5_000;

function pepper(): string {
  const p = process.env.FORUM_HASH_PEPPER;
  if (p) return p;
  if (process.env.NODE_ENV === "production") throw new Error("FORUM_HASH_PEPPER 가 설정되지 않았습니다 — 운영 환경 필수");
  return "zone-2-forum";
}

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function unb64url(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function hmacKey(usage: KeyUsage): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", new TextEncoder().encode(`${pepper()}:captcha`), { name: "HMAC", hash: "SHA-256" }, false, [usage]);
}
async function sign(payload: string): Promise<string> {
  const sig = await crypto.subtle.sign("HMAC", await hmacKey("sign"), new TextEncoder().encode(payload));
  return b64url(new Uint8Array(sig));
}
/** 서명 검증 — crypto.subtle.verify 는 상수시간 비교(문자열 !== 비교는 타이밍 누설, codex 리뷰) */
async function verifySig(payload: string, sig: string): Promise<boolean> {
  try {
    const sigBytes = unb64url(sig);
    const sigBuf = sigBytes.buffer.slice(sigBytes.byteOffset, sigBytes.byteOffset + sigBytes.byteLength) as ArrayBuffer;
    return await crypto.subtle.verify("HMAC", await hmacKey("verify"), sigBuf, new TextEncoder().encode(payload));
  } catch {
    return false;
  }
}

interface Payload {
  a: number;
  b: number;
  iat: number;
  nonce: string;
}

export interface CaptchaChallenge {
  token: string;
  /** 화면에 보일 문제 — "3 + 4" */
  question: string;
}

/** 새 문제 발급 — 한 자리 수 덧셈(합 ≤ 18, 고령 독자도 암산) */
export async function issueCaptcha(): Promise<CaptchaChallenge> {
  const rnd = new Uint8Array(10);
  crypto.getRandomValues(rnd);
  const a = (rnd[0] % 9) + 1;
  const b = (rnd[1] % 9) + 1;
  const payload: Payload = { a, b, iat: Date.now(), nonce: b64url(rnd.slice(2)) };
  const body = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await sign(body);
  return { token: `${body}.${sig}`, question: `${a} + ${b}` };
}

const used = new Map<string, number>(); // nonce → 만료 시각

export type CaptchaVerdict = { ok: true } | { ok: false; code: "missing" | "invalid" | "expired" | "too_fast" | "wrong" | "used" };

/** 토큰·답 검증. 통과하면 토큰을 사용 처리한다(재사용 불가). */
export async function verifyCaptcha(input: { token?: unknown; answer?: unknown } | null | undefined, now = Date.now()): Promise<CaptchaVerdict> {
  if (!input || typeof input.token !== "string" || input.answer === undefined || input.answer === null || input.answer === "") return { ok: false, code: "missing" };
  const [body, sig] = input.token.split(".");
  if (!body || !sig) return { ok: false, code: "invalid" };
  if (!(await verifySig(body, sig))) return { ok: false, code: "invalid" };
  let p: Payload;
  try {
    p = JSON.parse(new TextDecoder().decode(unb64url(body))) as Payload;
  } catch {
    return { ok: false, code: "invalid" };
  }
  if (!Number.isFinite(p.iat) || now - p.iat > TOKEN_TTL_MS) return { ok: false, code: "expired" };
  if (now - p.iat < MIN_ELAPSED_MS) return { ok: false, code: "too_fast" };
  // 사용 기록 정리 — 만료분을 비우고, 그래도 상한을 넘으면 오래된 것부터 지운다(메모리 상한 강제)
  if (used.size >= USED_MAX) {
    for (const [k, exp] of used) if (exp < now) used.delete(k);
    while (used.size >= USED_MAX) {
      const first = used.keys().next().value;
      if (first === undefined) break;
      used.delete(first);
    }
  }
  if (used.has(p.nonce)) return { ok: false, code: "used" };
  const answer = Number(String(input.answer).trim());
  if (!Number.isInteger(answer) || answer !== p.a + p.b) return { ok: false, code: "wrong" };
  used.set(p.nonce, p.iat + TOKEN_TTL_MS);
  return { ok: true };
}

export const CAPTCHA_MESSAGE: Record<Exclude<CaptchaVerdict, { ok: true }>["code"], string> = {
  missing: "자동등록방지 답을 입력해 주세요",
  invalid: "자동등록방지 확인에 실패했습니다. 새 문제로 다시 시도해 주세요",
  expired: "자동등록방지 문제가 만료됐습니다. 새 문제로 다시 시도해 주세요",
  too_fast: "너무 빨리 제출됐습니다. 잠시 후 다시 올려 주세요",
  wrong: "자동등록방지 답이 틀렸습니다",
  used: "이미 쓴 문제입니다. 새 문제로 다시 시도해 주세요",
};
