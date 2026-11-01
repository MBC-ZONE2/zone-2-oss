// ============================================================================
// components/forum/issue-temp — 글 ↔ 공론 온도 사안 매칭 (순수 함수, 서버/클라 공용)
//
// 상세 상단 "이 사안 온도" 눈금용. 온도 보드(issues.label·keywords)와 글의
// 제목+본문을 키워드 휴리스틱으로 잇는다(lib/reels/deck tempForItem 과 같은 방식).
// 매칭이 없거나 온도가 0 이면 null — 눈금은 "있을 때"만 그린다(기획안 (6)).
// ============================================================================

import type { TemperatureBoardItem } from "@/types";
import { bandForTemperature } from "@/lib/temperature/formula";

export interface IssueTemp {
  issueId: string | null;
  label: string;
  /** 0~100 */
  temperature: number;
  /** 밴드 라벨 (잠잠 · 미온 · 보통 · 뜨거움 · 매우 뜨거움) */
  band: string;
}

const norm = (t: string | null | undefined): string =>
  String(t || "").replace(/\s+/g, " ").trim().toLowerCase();

/** 제목+본문 텍스트에서 온도 사안 한 건을 찾는다 (보드 순서 = 온도 순 우선) */
export function matchIssueTemp(
  text: string,
  items: TemperatureBoardItem[] | null | undefined,
): IssueTemp | null {
  const hay = norm(text);
  if (!hay || !items?.length) return null;
  for (const row of items) {
    const t = Number(row.temperature) || 0;
    if (t <= 0) continue;
    const keys = [row.issue?.label, ...(row.issue?.keywords ?? [])]
      .map(norm)
      .filter((k) => k.length >= 2);
    if (keys.some((k) => hay.includes(k))) {
      return {
        issueId: row.issueId ?? row.issue?.id ?? null,
        label: row.issue?.label ?? "이 사안",
        temperature: Math.round(t),
        band: bandForTemperature(t).label,
      };
    }
  }
  return null;
}
