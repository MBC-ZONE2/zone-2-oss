// ============================================================================
// lib/temperature/dedupe — 이슈 중복 판정 (#183 후속, 2026-10-12)
//
// 매일 KST 04시 codex 가 최근 기사로 이슈를 다시 뽑는데, 기존 이슈와 **라벨 문자열이 같을 때만** 걸러서
// 같은 사안이 라벨만 바뀐 채 쌓였다(실측 169건 중 124건이 30개 그룹의 변형, 송전선로 14건). 매칭 여론이
// 변형들로 흩어져 온도·순위가 모두 흐려진다. 여기 규칙을 이슈 생성(issues.ts)과 정리 스크립트
// (scripts/ops/merge-duplicate-issues.ts)가 함께 쓴다.
//
// 같은 사안 판정(둘 중 하나):
//   ① 키워드 겹침 — 정규화(소문자·공백 제거)한 키워드가 같거나 한쪽이 다른 쪽을 포함하면 "공유".
//      공유 수 ÷ 더 적은 쪽 키워드 수 ≥ 0.5
//   ② 라벨 낱말 Jaccard ≥ 0.5
// 느슨한 "키워드 1개 공유"는 쓰지 않는다 — 청주공항(돈므앙 노선 vs 추석 특별수송), 옥천군의회(질의 불신 vs
// 농업기술센터)처럼 다른 사안을 묶어 버린다(실측).
// ============================================================================

export interface IssueLike {
  label: string;
  keywords: string[] | null | undefined;
}

export const KEYWORD_SHARE_MIN = 0.5;
export const LABEL_JACCARD_MIN = 0.5;
/** 병합 뒤 키워드 상한 — 너무 길면 매칭이 느슨해진다 */
export const MAX_KEYWORDS = 8;

export function normKeyword(k: string): string {
  return k.toLowerCase().replace(/\s+/g, "");
}

export function labelTokens(label: string): Set<string> {
  return new Set(label.toLowerCase().split(/[^0-9a-z가-힣]+/).filter((t) => t.length >= 2));
}

/** 포함 관계로 "공유"로 볼 때 짧은 쪽 최소 길이 — "군의회"(3) 같은 범용어가 여러 사안을 묶는 것을 막는다 */
const CONTAIN_MIN_LEN = 5;

function keywordMatch(x: string, y: string): boolean {
  if (x === y) return true;
  const shorter = x.length <= y.length ? x : y;
  if (shorter.length < CONTAIN_MIN_LEN) return false;
  return x.includes(y) || y.includes(x);
}

/** 양방향으로 센 뒤 작은 쪽 — 한쪽 키워드 여러 개가 같은 상대 키워드에 걸려 부풀지 않게 */
function sharedKeywords(a: string[], b: string[]): number {
  const ab = a.filter((x) => b.some((y) => keywordMatch(x, y))).length;
  const ba = b.filter((y) => a.some((x) => keywordMatch(x, y))).length;
  return Math.min(ab, ba);
}

/** 두 이슈가 같은 사안인가 */
export function isSameIssue(a: IssueLike, b: IssueLike): boolean {
  const ka = [...new Set((a.keywords ?? []).map(normKeyword).filter(Boolean))];
  const kb = [...new Set((b.keywords ?? []).map(normKeyword).filter(Boolean))];
  if (ka.length > 0 && kb.length > 0) {
    const share = sharedKeywords(ka, kb) / Math.min(ka.length, kb.length);
    if (share >= KEYWORD_SHARE_MIN) return true;
  }
  const ta = labelTokens(a.label);
  const tb = labelTokens(b.label);
  if (ta.size === 0 || tb.size === 0) return false;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter += 1;
  const union = new Set([...ta, ...tb]).size;
  return union > 0 && inter / union >= LABEL_JACCARD_MIN;
}

/** 두 키워드 목록을 합친다 — 원 표기 유지, 정규화 기준 중복 제거, 상한 MAX_KEYWORDS */
export function mergeKeywords(base: string[] | null | undefined, extra: string[] | null | undefined): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const k of [...(base ?? []), ...(extra ?? [])]) {
    const t = k.trim();
    if (!t) continue;
    const n = normKeyword(t);
    if (seen.has(n)) continue;
    seen.add(n);
    out.push(t);
    if (out.length >= MAX_KEYWORDS) break;
  }
  return out;
}

/**
 * 같은 사안끼리 그룹으로 묶는다(추이적: A~B, B~C 면 한 그룹). 입력 순서가 곧 대표(첫 원소) 우선순위.
 */
export function groupDuplicates<T extends IssueLike>(items: T[]): T[][] {
  const groups: T[][] = [];
  for (const it of items) {
    const hit = groups.find((g) => g.some((m) => isSameIssue(m, it)));
    if (hit) hit.push(it);
    else groups.push([it]);
  }
  return groups;
}
