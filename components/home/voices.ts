// ============================================================================
// components/home/voices — "주민의 목소리" 서버 헬퍼 (허용된 서버 확장 #2)
//
// 홈 리드 하단의 3단 인용에 쓸 댓글을 조회한다. comments 테이블은 공개 SELECT
// 정책(comments_public_read, anon)이 있으므로 anon 키 서버 클라이언트로 읽는다.
//   - 정렬: like_count 내림차순(동률은 최신순) — 공감이 큰 목소리 우선
//   - 본문: 80자 이내로 절단(표시 밀도)
//   - 출처 라벨: 연결 기사 카테고리 + "기사 댓글" (카테고리 없으면 "기사 댓글")
// 실패(테이블 없음·권한·네트워크)는 전부 흡수해 빈 배열을 반환한다 → 섹션 미노출
// (홈 불파괴 원칙). lib/**·app/api/** 는 건드리지 않는다.
// ============================================================================

import { createClient } from "@/lib/supabase/server";
import { truncate } from "./format";

/** 주민의 목소리 한 건 (표시용) */
export interface ResidentVoice {
  id: string;
  /** 80자 이내로 절단된 본문 */
  body: string;
  /** 출처 라벨 (예: "경제 기사 댓글") */
  sourceLabel: string;
}

/** 본문 절단 상한(자) */
const MAX_BODY = 80;

/** comments 조인 row (관계는 객체/배열 모두 올 수 있어 방어적으로 받는다) */
interface VoiceRow {
  id: string;
  body: string;
  articles:
    | { category: string | null }
    | { category: string | null }[]
    | null;
}

/** 조인된 관계에서 카테고리를 꺼낸다(배열/객체/누락 방어). */
function pickCategory(relation: VoiceRow["articles"]): string | null {
  if (Array.isArray(relation)) {
    return relation[0]?.category ?? null;
  }
  return relation?.category ?? null;
}

/** 카테고리 → 출처 라벨 */
function sourceLabel(category: string | null): string {
  const cat = category?.trim();
  return cat ? `${cat} 기사 댓글` : "기사 댓글";
}

/**
 * 공감 상위 댓글을 조회해 "주민의 목소리" 인용 목록을 반환한다.
 * 어떤 실패든 빈 배열을 반환한다(섹션 미노출).
 * @param limit 반환 건수(기본 3)
 */
export async function getResidentVoices(limit = 3): Promise<ResidentVoice[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("comments")
      .select("id, body, articles(category)")
      .neq("body", "") // 보존 기간이 지나 본문을 비운 댓글(lib/ingest/retention)은 상위 슬롯을 차지하지 않게 질의에서 뺀다
      .order("like_count", { ascending: false })
      .order("published_at", { ascending: false })
      .limit(limit);
    if (error) return [];

    const rows = (data ?? []) as unknown as VoiceRow[];
    return rows
      .filter((r) => r.body?.trim())
      .map((r) => ({
        id: r.id,
        body: truncate(r.body, MAX_BODY),
        sourceLabel: sourceLabel(pickCategory(r.articles)),
      }));
  } catch {
    return [];
  }
}
