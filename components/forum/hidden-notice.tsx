// ============================================================================
// components/forum/hidden-notice — 삭제/가려짐 자리표시자 (원문 비노출)
//
// - deleted: 본인 소프트 삭제 → "삭제된 {글|댓글}입니다"
// - flagged: 신고 누적·모더레이션 → "운영 정책에 따라 가려진 {댓글}입니다"
// 시각: 점선 인용괘선(= 아직/더는 없음) + 활자. 면·색 없음.
// ============================================================================

interface HiddenNoticeProps {
  kind: "deleted" | "flagged";
  /** 대상 명칭 ("글" | "댓글") */
  target: string;
}

/** 가려진/삭제된 콘텐츠 자리표시자 */
export function HiddenNotice({ kind, target }: HiddenNoticeProps) {
  const label = kind === "deleted" ? "삭제됨" : "가려짐";
  const text =
    kind === "deleted"
      ? `삭제된 ${target}입니다`
      : `운영 정책에 따라 가려진 ${target}입니다`;
  return (
    <div className="fo-hidden">
      <b>{label}</b>
      <p>{text}</p>
    </div>
  );
}
