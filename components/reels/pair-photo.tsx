"use client";
// ============================================================================
// components/reels/pair-photo — 표지 사진 한 장 + 13px 출처 한 줄 (깨지면 다음 후보로)
//
// 회의 결정 [3] 의 우선순위(옥천신문 원본 → MBC충북 원본 → AI 카드)는 lib/reels/pair-image
// 가 정한다. 여기서는 그 **후보 목록**을 받아, DB 에 URL 이 있어도 실제 로딩이 403/404·
// 핫링크 차단으로 깨지면 다음 후보로 내려가고 **출처 문구도 함께 갈아 끼운다** —
// 깨진 사진과 남의 이름이 지면에 남지 않게. 후보가 다 떨어지면 아무것도 그리지 않는다
// (무사진 폴백 조판은 호출부 몫 — 사진 유무 분기는 호출부가 candidates.length 로 판단).
//
// 「일점 지면」: 래퍼 <div> 를 만들지 않고 Fragment 로 DotImage + PhotoCredit 을 나란히 둔다.
// 호출부 CSS 가 .cover-body > .dot-img, .cs-cover > .cs-photo, .s-card > .bleed 처럼
// **직계 자식**을 잡기 때문에 한 겹만 끼워도 조판이 무너진다.
// 클라이언트 경계이므로 props 는 직렬화 가능한 값(문자열·배열·평범한 객체)만 받는다.
// ============================================================================
import { useCallback, useState, type CSSProperties } from "react";
import DotImage from "./dot-image";
import PhotoCredit from "./photo-credit";
import {
  pairImageCandidates,
  type PairImageCandidate,
  type PairImageInput,
} from "@/lib/reels/pair-image";

export default function PairPhoto({
  pair,
  candidates,
  alt = "",
  heightClass = "",
  className = "",
  eager = false,
  showCredit = true,
  creditClassName,
  creditStyle,
}: {
  /** 페어 원본(직렬화 가능한 평범한 객체) — candidates 를 안 줄 때 여기서 후보를 뽑는다 */
  pair?: PairImageInput | null;
  /** 이미 뽑아 둔 후보 목록(우선). 호출부가 사진 유무로 조판을 가를 때 함께 쓴다 */
  candidates?: PairImageCandidate[];
  /** 장식 사진이면 "" (기본) */
  alt?: string;
  /** DotImage 높이 프리셋 클래스 */
  heightClass?: string;
  /** DotImage 추가 클래스 (예: "bleed") */
  className?: string;
  /** 첫 화면에 바로 보이는 사진이면 true */
  eager?: boolean;
  /** 출처 한 줄 표시 여부(기본 표시) */
  showCredit?: boolean;
  creditClassName?: string;
  /** 좌우 여백 등 화면별 보정 */
  creditStyle?: CSSProperties;
}) {
  const list = candidates ?? pairImageCandidates(pair);
  // 후보 목록이 바뀌면(다른 페어로 교체) 인덱스를 0 으로 되돌린다 — 렌더 중 상태 조정 패턴
  const sig = list.map((c) => c.src).join("|");
  const [at, setAt] = useState({ sig, i: 0 });
  if (at.sig !== sig) setAt({ sig, i: 0 });
  const i = at.sig === sig ? at.i : 0;

  // 로딩 실패 → 다음 후보. 다 떨어지면 i 가 목록 밖으로 나가 아무것도 렌더하지 않는다
  const onError = useCallback(() => {
    setAt((s) => ({ ...s, i: s.i + 1 }));
  }, []);

  const cur = list[i];
  if (!cur) return null;
  return (
    <>
      <DotImage
        src={cur.src}
        alt={alt}
        heightClass={heightClass}
        className={className}
        eager={eager}
        onError={onError}
      />
      {showCredit && (
        <PhotoCredit credit={cur.credit} className={creditClassName} style={creditStyle} />
      )}
    </>
  );
}
