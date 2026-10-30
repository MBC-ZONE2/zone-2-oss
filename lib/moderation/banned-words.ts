// ============================================================================
// lib/moderation/banned-words — 금칙어 사전 (공론장 필터 + 팟캐스트 QA 공용)
//
// 출처: docs/04-데이터모델.md "금칙어 사전: lib/moderation/banned-words.ts"
// 사유 분류(reason)는 forum_posts.flag_reason 와 동일한 라벨을 사용한다.
//   - hate : 혐오/차별/욕설
//   - spam : 광고/도배/외부 유인
// 정규식이 아닌 단순 부분일치를 기본으로 하되, 공백·반복문자를 일부 정규화한다.
// 운영 중에는 /api/admin/banned-words 로 동적 관리 예정(그룹 E). 여기엔 시드만 둔다.
// ============================================================================

/** 금칙어 분류 — flag_reason 라벨과 호환 */
export type BannedWordReason = "hate" | "spam";

/** 금칙어 항목 */
export interface BannedWord {
  /** 소문자·공백제거된 비교용 토큰 */
  word: string;
  reason: BannedWordReason;
}

// 시드 사전. 실제 운영 사전은 DB(admin 관리)로 확장한다.
// 데모/개발용 최소 셋만 둔다(과도한 차단 방지).
export const BANNED_WORDS: BannedWord[] = [
  // 혐오/욕설 (예시 — 실제 운영 사전은 별도 관리)
  { word: "씨발", reason: "hate" },
  { word: "시발", reason: "hate" },
  { word: "ㅅㅂ", reason: "hate" },
  { word: "병신", reason: "hate" },
  { word: "개새끼", reason: "hate" },
  { word: "좆", reason: "hate" },
  { word: "지랄", reason: "hate" },
  // 스팸/광고
  { word: "카지노", reason: "spam" },
  { word: "토토", reason: "spam" },
  { word: "바카라", reason: "spam" },
  { word: "비아그라", reason: "spam" },
  { word: "대출문의", reason: "spam" },
  { word: "vvip", reason: "spam" },
];

/**
 * 비교용 정규화: 소문자 + 공백/구두점 제거 + 3회 이상 반복문자 축약.
 * "씨@@발", "씨 발", "씨이이이발" 같은 단순 우회를 일부 흡수한다.
 */
export function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\s​._\-*~!@#$%^&()+=/\\|]/g, "") // 공백·구두점 제거
    .replace(/(.)\1{2,}/g, "$1$1"); // aaaa -> aa
}

/** 금칙어 검사 결과 */
export interface BannedWordHit {
  matched: boolean;
  /** 매칭된 금칙어(정규화 전 사전 토큰) */
  word?: string;
  reason?: BannedWordReason;
}

/**
 * 금칙어 사전 기반 검사. 첫 매칭을 반환한다(없으면 matched:false).
 * dict 를 주입하면 운영 사전(DB 로드)과 합쳐 검사할 수 있다.
 */
export function checkBannedWords(
  text: string,
  dict: BannedWord[] = BANNED_WORDS,
): BannedWordHit {
  const normalized = normalizeForMatch(text);
  for (const entry of dict) {
    const token = normalizeForMatch(entry.word);
    if (token.length > 0 && normalized.includes(token)) {
      return { matched: true, word: entry.word, reason: entry.reason };
    }
  }
  return { matched: false };
}
