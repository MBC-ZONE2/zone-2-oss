// ============================================================================
// lib/reels/pair-image — 크로스뷰 페어 한 쌍에서 "표지에 쓸 사진 한 장"을 고른다
//
// 회의 결정 [3]: 기사 이미지는 **옥천신문 원본을 우선**, AI 생성 이미지(card_image_url)는 보완용.
// 우선순위
//   ① 기초(옥천신문) 기사의 원본 사진 — micro.imageUrl
//   ② 없으면 광역(MBC충북) 기사의 원본 사진 — macro.imageUrl
//      (유튜브 기사는 썸네일뿐이라 mappers.normalizeImageUrl 이 이미 null 로 떨군다)
//   ③ 둘 다 없으면 AI 생성 카드 이미지 — cardImageUrl
//   ④ 그것도 없으면 사진 없음(각 화면의 무사진 폴백 조판)
//
// 원본 사진을 쓸 때는 캡션 자리에 13px "사진 · 옥천신문"(또는 "사진 · MBC충북") 출처를 붙인다.
// 표지 사진을 쓰는 모든 화면(홈 표지 히어로·덱 카드·덱 스토리 표지·데스크탑 보드 썸네일·
// 크로스뷰 상세 OG)이 이 헬퍼 하나만 본다 — 규칙이 갈라지지 않게.
// 점묘 마스크(DotImage)는 출처와 무관하게 동일하게 적용한다.
//
// 이 함수는 "고른 한 장"과 함께 **후보 목록(candidates)** 을 돌려준다. URL 이 DB 에 문자열로
// 들어 있다고 로딩까지 되는 건 아니어서(원본 서버가 403/404·핫링크 차단), 화면 쪽
// PairPhoto 가 로딩 실패를 받으면 다음 후보로 내려가고 출처 문구도 함께 갈아 끼운다.
// candidates[0] 은 언제나 src/kind/credit 과 같은 값이라 기존 호출부(OG 메타 등)는 그대로다.
// ============================================================================

import type { MediaSource } from "@/types";
import { sourceLabel } from "@/config/region";

/** 고른 사진의 출처 종류 — 'ai' 는 자체 생성 카드 이미지 */
export type PairImageKind = "okinews" | "mbc" | "ai";

/** 사진 후보 한 장 — 우선순위 순으로 늘어선다(앞이 깨지면 뒤가 대신 뜬다) */
export interface PairImageCandidate {
  /** 표시할 사진 URL */
  src: string;
  /** 출처 종류 */
  kind: PairImageKind;
  /** 사진 옆 13px 출처 표기 문구. AI 생성이면 null(표기 안 함) */
  credit: string | null;
}

/** pairImage 결과 */
export interface PairImage {
  /** 표시할 사진 URL. 없으면 null */
  src: string | null;
  /** 출처 종류. 사진이 없으면 null */
  kind: PairImageKind | null;
  /** 사진 옆 13px 출처 표기 문구. AI 생성이거나 사진이 없으면 null(표기 안 함) */
  credit: string | null;
  /** 우선순위 순 후보 전체. 첫 원소 = 위 src/kind/credit. 사진이 없으면 빈 배열 */
  candidates: PairImageCandidate[];
}

/** pairImage 가 읽는 최소 형태 — 목록/상세/스토리의 페어 타입이 모두 구조적으로 들어맞는다 */
export interface PairImageInput {
  cardImageUrl?: string | null;
  macro?: { source?: MediaSource | null; imageUrl?: string | null } | null;
  micro?: { source?: MediaSource | null; imageUrl?: string | null } | null;
}

/** 매체별 출처 문구 — 캡션은 "사진 · <매체>" 한 줄 */
const CREDIT: Record<MediaSource, string> = {
  okinews: `사진 · ${sourceLabel("okinews")}`,
  mbc_cb: `사진 · ${sourceLabel("mbc_cb")}`,
};

/**
 * <img src> 로 걸어 볼 만한 모양인지 최소 검사.
 * 공백·조각 문자열이 "문자열이니까 사진이 있다"로 통과해 빈 칸을 만드는 걸 막는다.
 * (실제 로딩 실패는 여기서 알 수 없다 — PairPhoto 의 onError 폴백이 받는다)
 */
function usableUrl(raw: string | null | undefined): string | null {
  const src = raw?.trim();
  if (!src) return null;
  return /^(https?:\/\/|\/\/|\/|data:image\/)/i.test(src) ? src : null;
}

/** 기사 한 건에서 쓸 만한 원본 사진을 꺼낸다 (Article.imageUrl 은 이미 정규화된 값) */
function fromArticle(
  article: PairImageInput["macro"],
  fallbackSource: MediaSource,
): PairImageCandidate | null {
  const src = usableUrl(article?.imageUrl);
  if (!src) return null;
  const source = article?.source ?? fallbackSource;
  return {
    src,
    kind: source === "okinews" ? "okinews" : "mbc",
    credit: CREDIT[source] ?? null,
  };
}

/**
 * 페어의 표지 사진 후보를 우선순위 순으로 모은다.
 * 옥천신문 원본 → MBC 원본 → AI 카드 이미지.
 */
export function pairImageCandidates(
  pair: PairImageInput | null | undefined,
): PairImageCandidate[] {
  if (!pair) return [];
  const out: PairImageCandidate[] = [];
  const micro = fromArticle(pair.micro, "okinews");
  if (micro) out.push(micro);
  const macro = fromArticle(pair.macro, "mbc_cb");
  if (macro) out.push(macro);
  const ai = usableUrl(pair.cardImageUrl);
  // AI 생성 이미지에는 매체 출처가 없다 — 각 화면이 'AI가 정리' 스탬프로 이미 밝힌다
  if (ai) out.push({ src: ai, kind: "ai", credit: null });
  // 같은 URL 이 두 자리에 들어간 페어가 있어 중복은 떨군다(같은 사진을 두 번 시도하지 않게)
  return out.filter((c, i) => out.findIndex((o) => o.src === c.src) === i);
}

/**
 * 페어의 표지 사진 한 장을 고른다(+ 뒤이을 후보 목록).
 * 옥천신문 원본 → MBC 원본 → AI 카드 이미지 순.
 */
export function pairImage(pair: PairImageInput | null | undefined): PairImage {
  const candidates = pairImageCandidates(pair);
  const first = candidates[0];
  return {
    src: first?.src ?? null,
    kind: first?.kind ?? null,
    credit: first?.credit ?? null,
    candidates,
  };
}
