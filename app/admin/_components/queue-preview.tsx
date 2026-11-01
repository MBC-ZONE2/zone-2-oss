"use client";

// ============================================================================
// app/admin/_components/queue-preview — 행 펼침 상세 (대상별, 「일점 지면」)
//
// 출처: REQ(F7) — 미리보기 강화 (이슈 #34)
//
//  - 크로스뷰: 양측 기사 제목 + 요약 원문(광역/기초) — ⋯/▬ 마커 두 칼럼
//  - 팟캐스트: 대본 전문 + 금칙어 히트(빨강 밑줄, 면 없음)
//  - 공론장  : 본문 + flag_reason + 신고 수 + 좋아요 수
// 점선 괘선 아래 이어지는 활자 블록 — 회색 면·라운드 없음. 스타일: app/admin.css(.ad-detail)
// ============================================================================

import { Marker, OUTLET, TIER } from "@/components/crossview/marker";
import { highlightBanned, detailStr, detailNum, FLAG_LABEL, type QueueItem } from "./lib";

/** 라벨 붙은 텍스트 블록 */
function Field({ label, value }: { label: string; value: string | null }) {
  const has = Boolean(value?.trim());
  return (
    <div className="ad-fieldset">
      <span>{label}</span>
      <p className={has ? undefined : "is-empty"}>{has ? value : "—"}</p>
    </div>
  );
}

/** 크로스뷰 상세 — 양측 관점 요약 */
function CrossviewPreview({ detail }: { detail: Record<string, unknown> }) {
  return (
    <div className="ad-cols">
      {(["macro", "micro"] as const).map((side) => (
        <div className="ad-side" key={side} style={{ gap: 10 }}>
          <span className="ad-side-k">
            <Marker side={side} />
            {TIER[side]} · {OUTLET[side]}
          </span>
          <Field
            label="기사 제목"
            value={detailStr(detail, side === "macro" ? "macroTitle" : "microTitle")}
          />
          <Field
            label="요약 원문"
            value={detailStr(detail, side === "macro" ? "summaryMacro" : "summaryMicro")}
          />
        </div>
      ))}
    </div>
  );
}

/** 팟캐스트 상세 — 대본 전문 + 금칙어 하이라이트 */
function PodcastPreview({ detail }: { detail: Record<string, unknown> }) {
  const script = detailStr(detail, "script") ?? "";
  const segs = highlightBanned(script);
  return (
    <div className="ad-fieldset">
      <span>대본 전문</span>
      <p className="ad-script">
        {script.trim() ? (
          segs.map((s, i) => (s.banned ? <mark key={i}>{s.text}</mark> : <span key={i}>{s.text}</span>))
        ) : (
          <span className="is-empty">대본이 없습니다.</span>
        )}
      </p>
    </div>
  );
}

/** 공론장 상세 — 본문 + 플래그/신고/좋아요 */
function ForumPreview({ detail }: { detail: Record<string, unknown> }) {
  const flag = detailStr(detail, "flagReason");
  const reports = detailNum(detail, "reportCount") ?? 0;
  const likes = detailNum(detail, "likeCount") ?? 0;
  return (
    <>
      <div className="ad-chips">
        <span className="ad-chip" data-tone="danger">
          플래그: {flag ? (FLAG_LABEL[flag] ?? flag) : "미상"}
        </span>
        <span className="ad-chip" data-tone="muted">
          신고 {reports}회
        </span>
        <span className="ad-chip" data-tone="muted">
          좋아요 {likes}
        </span>
      </div>
      <Field label="본문" value={detailStr(detail, "body")} />
    </>
  );
}

export function QueuePreview({ item }: { item: QueueItem }) {
  return (
    <div className="ad-detail">
      {item.target === "crossview" && <CrossviewPreview detail={item.detail} />}
      {item.target === "podcast" && <PodcastPreview detail={item.detail} />}
      {item.target === "forum" && <ForumPreview detail={item.detail} />}
    </div>
  );
}
