// ============================================================================
// lib/forum/attempts — 글·댓글 비밀번호 추측 제한 (보안 검수 2026-10-26)
//
// 수정·삭제는 글쓴이가 정한 비밀번호(4자 이상)로만 확인하는데, 시도 횟수 제한이 없으면 숫자 4자리는 1만 번 안에
// 뚫리고 시도마다 PBKDF2 12만 회가 돌아 CPU 도 낭비된다. 대상 글 id + 요청 IP 해시 기준으로
// 10분 안에 5번 틀리면 그 조합을 10분 잠근다. 프로세스 메모리(단일 서버)라 재시작하면 초기화된다.
// ============================================================================

import { createHash } from "node:crypto";

const WINDOW_MS = 10 * 60_000;
const MAX_FAILURES = 5;
const MAX_BUCKETS = 10_000;
const buckets = new Map<string, { fails: number; until: number }>();

function keyOf(targetId: string, ip: string | null): string {
  const ipPart = createHash("sha256").update(ip ?? "unknown").digest("hex").slice(0, 16);
  return `${targetId}:${ipPart}`;
}

/** 지금 시도해도 되는가. 잠겨 있으면 false */
export function canAttemptPassword(targetId: string, ip: string | null): boolean {
  const b = buckets.get(keyOf(targetId, ip));
  if (!b) return true;
  if (Date.now() > b.until) {
    buckets.delete(keyOf(targetId, ip));
    return true;
  }
  return b.fails < MAX_FAILURES;
}

/** 실패를 기록한다 */
export function recordPasswordFailure(targetId: string, ip: string | null): void {
  const k = keyOf(targetId, ip);
  const now = Date.now();
  const b = buckets.get(k);
  if (!b || now > b.until) {
    buckets.delete(k); // 재삽입해 Map 삽입 순서(=오래된 순)를 유지한다
    buckets.set(k, { fails: 1, until: now + WINDOW_MS });
  } else b.fails += 1;
  // 메모리 상한 — 만료분을 걷고도 MAX_BUCKETS 를 넘으면 가장 오래된 것부터 지운다(임의 UUID 난사로 Map 이 무한히 크는 것 방지, codex 리뷰)
  if (buckets.size > MAX_BUCKETS) {
    for (const [kk, v] of buckets) if (now > v.until) buckets.delete(kk);
    while (buckets.size > MAX_BUCKETS) {
      const oldest = buckets.keys().next().value;
      if (oldest === undefined) break;
      buckets.delete(oldest);
    }
  }
}

/** 성공하면 그 조합의 실패 기록을 지운다 */
export function clearPasswordFailures(targetId: string, ip: string | null): void {
  buckets.delete(keyOf(targetId, ip));
}
