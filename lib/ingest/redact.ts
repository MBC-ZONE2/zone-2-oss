// ============================================================================
// lib/ingest/redact — 수집 시점 개인정보 마스킹
//
// deliverables/04-데이터수집-범위표.md §5:
//   "연락처·주소·주민번호 등 → 수집 시 마스킹/제외"
//
// 작성자 식별자는 hash.ts 가 해시화하지만, 본문에 제3자 연락처가 그대로 적히는
// 경우(특히 공개 유튜브 댓글)는 별도로 막아야 한다. 저장 전에 치환하므로
// 원본은 DB 에 남지 않는다.
//
// ⚠️ 한계: 한국어 주소는 오탐 없이 잡기 어려워 여기서 다루지 않는다.
//    (게시글 내 제3자 정보는 §5 대로 검수 단계에서 비식별 — 06 검수기준표)
// ============================================================================

/** 치환 표기 — 무엇이 지워졌는지 사람이 알 수 있게 남긴다 */
const MASK = {
  rrn: "[주민번호]",
  phone: "[연락처]",
  email: "[이메일]",
  card: "[카드번호]",
} as const;

/**
 * 마스킹 규칙.
 * 순서 주의 — 주민번호를 전화번호보다 먼저 잡아야 한다(자릿수 겹침).
 */
const RULES: ReadonlyArray<{ pattern: RegExp; mask: string }> = [
  // 주민등록번호 6자리-7자리 (뒷자리 첫 글자는 성별코드 1~4/5~8)
  { pattern: /\b\d{6}\s?[-–]\s?[1-8]\d{6}\b/g, mask: MASK.rrn },
  // 카드번호 4-4-4-4 (구분자 - 또는 공백)
  { pattern: /\b\d{4}[\s-]\d{4}[\s-]\d{4}[\s-]\d{4}\b/g, mask: MASK.card },
  // 이메일
  { pattern: /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, mask: MASK.email },
  // 휴대폰 010-1234-5678 / 01012345678 / 010 1234 5678
  { pattern: /\b01[016789][\s-]?\d{3,4}[\s-]?\d{4}\b/g, mask: MASK.phone },
  // 지역번호 유선 02-123-4567 / 043-123-4567
  { pattern: /\b0\d{1,2}[\s-]\d{3,4}[\s-]\d{4}\b/g, mask: MASK.phone },
];

/**
 * 본문에서 개인정보로 보이는 문자열을 치환한다.
 *
 * @param text 원본 본문
 * @returns 마스킹된 본문 (입력이 비어 있으면 그대로)
 */
export function redactPii(text: string): string {
  if (!text) return text;
  return RULES.reduce(
    (acc, { pattern, mask }) => acc.replace(pattern, mask),
    text,
  );
}

/** 마스킹이 일어났는지 (검증·로깅용 — 원문은 반환하지 않는다) */
export function hasPii(text: string): boolean {
  return redactPii(text) !== text;
}
