"use client";

// ============================================================================
// app/admin/_components/queue-item-card — 검수 큐 단일 항목 (괘선 행, 「일점 지면」)
//
// 출처: REQ(F7) — 3버튼(승인/수정승인/반려) + SLA + 펼침 미리보기 + 일괄 선택
//
// 카드가 아니라 1px 괘선 행이다(app/admin.css .ad-item). 결정에 필요한 정보를 행 표면에:
//   - 아이브로우: 대상 · 대기 시간(SLA 초과면 빨강) · 플래그/금칙어 칩 · 양측 확인 현황
//   - 제목 20px 700
//   - 크로스뷰: 광역/기초 두 시선(공개 지면과 같은 ⋯/▬ 마커 + 매체 라벨) + 매칭·유사도 미터
//   - 팟캐스트/공론장: 미리보기 2줄 + 메타 칩
// 상세 원문은 "미리보기 펼치기"로 확장한다.
//
// 이중 컨펌(회의 결정 [9]): 크로스뷰·팟캐스트는 "옥천신문 ✓ / MBC충북 –" 칩으로 양측
// 확인 현황을 보여 주고, 승인 버튼을 소속별 확인 버튼으로 나눈다. 내 소속 버튼만
// 보이며(super_admin 은 둘 다) 상대 소속은 칩의 현황으로 읽는다. 소속이 없으면 안내.
// 반려 사유 칸은 "반려" 를 처음 누를 때 펼친다(진행 노출) — 항목마다 빈 칸을 늘어놓지 않는다.
// ============================================================================

import { useState, type CSSProperties } from "react";
import { Button } from "@/components/ui/button";
import { Marker, OUTLET, TIER } from "@/components/crossview/marker";
import { QueuePreview } from "./queue-preview";
import {
  canConfirmAs,
  confirmBlockReason,
  elapsedInfo,
  fmtDateTime,
  hasBannedHit,
  isDualTarget,
  readConfirmations,
  detailStr,
  detailNum,
  CONFIRM_ORGS,
  REQUIRED_CONFIRMATIONS,
  FLAG_LABEL,
  ORG_LABEL,
  TARGET_LABEL,
  type AdminOrg,
  type QueueItem,
  type QueueViewer,
} from "./lib";

/** 이중 컨펌 현황 — "옥천신문 ✓ / MBC충북 –" 1px 괘선 칩(확인된 쪽은 잉크 면) */
/** 한쪽 확인 후 자동 공개까지의 시간(시간) — 서버 CONFIRM_TIMEOUT_HOURS 와 같은 값(기본 3). REQUIRED_CONFIRMATIONS=1(2026-10-29) 이면 쓰이지 않는다 */
const AUTO_PUBLISH_HOURS = Number(process.env.NEXT_PUBLIC_CONFIRM_TIMEOUT_HOURS ?? "0") || 0;

function ConfirmBadges({ item }: { item: QueueItem }) {
  const map = readConfirmations(item);
  const done = CONFIRM_ORGS.filter((o) => map[o]);
  // 한 기관만 확인 → 자동 공개 예정 시각을 칩으로
  const dueAt = REQUIRED_CONFIRMATIONS > 1 && done.length === 1 && AUTO_PUBLISH_HOURS > 0 ? new Date(Date.parse(map[done[0]]!) + AUTO_PUBLISH_HOURS * 3600_000) : null;
  return (
    <span className="ad-chips" aria-label="양측 확인 현황">
      {dueAt ? (
        <span className="ad-chip" data-tone="muted" title={`한쪽 확인 후 ${AUTO_PUBLISH_HOURS}시간이 지나면 상대 확인 없이 자동 공개됩니다(되돌리기 가능)`}>
          {dueAt.getTime() <= Date.now() ? "곧 자동 공개" : `자동 공개 ${fmtDateTime(dueAt.toISOString())}`}
        </span>
      ) : null}
      {CONFIRM_ORGS.map((org) => {
        const at = map[org];
        return (
          <span
            key={org}
            className="ad-chip"
            data-done={at ? "true" : undefined}
            data-tone={at ? undefined : "muted"}
            title={at ? `${ORG_LABEL[org]} 확인 ${fmtDateTime(at)}` : `${ORG_LABEL[org]} 확인 대기`}
          >
            <span aria-hidden>{at ? "✓" : "–"}</span>
            {ORG_LABEL[org]}
          </span>
        );
      })}
    </span>
  );
}

/** 0~1 점수 → 3px 잉크 미터(결정 신호를 행 표면에) */
function ScoreMeter({ label, value }: { label: string; value: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className="ad-meter">
      <span>
        {label}
        <b>{pct}%</b>
      </span>
      <i style={{ "--pct": `${pct}%` } as CSSProperties} role="presentation" />
    </div>
  );
}

/** 크로스뷰: 광역·기초 두 시선을 나란히 (제목은 enrich 값) */
function CrossviewGlance({ item }: { item: QueueItem }) {
  const macro = detailStr(item.detail, "macroTitle");
  const micro = detailStr(item.detail, "microTitle");
  const match = typeof item.meta.matchScore === "number" ? item.meta.matchScore : null;
  const sim = typeof item.meta.similarity === "number" ? item.meta.similarity : null;
  return (
    <div className="ad-glance">
      {(["macro", "micro"] as const).map((side) => {
        const title = side === "macro" ? macro : micro;
        return (
          <div className="ad-side" key={side}>
            <span className="ad-side-k">
              <Marker side={side} />
              {TIER[side]} · {OUTLET[side]}
            </span>
            <p className={title ? undefined : "is-empty"}>{title ?? "기사 제목 미상"}</p>
          </div>
        );
      })}
      {(match !== null || sim !== null) && (
        <div className="ad-meters" style={{ gridColumn: "1 / -1" }}>
          {match !== null && <ScoreMeter label="매칭 점수" value={match} />}
          {sim !== null && <ScoreMeter label="유사도" value={sim} />}
        </div>
      )}
    </div>
  );
}

/** 팟캐스트/공론장: 메타 칩 */
function MetaChips({ item }: { item: QueueItem }) {
  const chips: string[] = [];
  const m = item.meta;
  if (item.target === "podcast") {
    if (typeof m.durationSec === "number") chips.push(`${Math.round(m.durationSec / 60)}분`);
    if (typeof m.scheduledFor === "string") chips.push(`예정 ${m.scheduledFor}`);
  } else if (item.target === "forum") {
    if (typeof m.likeCount === "number") chips.push(`좋아요 ${m.likeCount}`);
    const reports = detailNum(item.detail, "reportCount");
    if (reports) chips.push(`신고 ${reports}회`);
  }
  if (chips.length === 0) return null;
  return (
    <div className="ad-chips">
      {chips.map((c) => (
        <span key={c} className="ad-chip" data-tone="muted">
          {c}
        </span>
      ))}
    </div>
  );
}

export interface QueueItemCardProps {
  item: QueueItem;
  canModerate: boolean;
  /** 큐를 보는 사람 — 어느 소속으로 확인할 수 있는지 판단한다. */
  viewer: QueueViewer | null;
  selectable: boolean;
  blockReason: string;
  selected: boolean;
  onToggleSelect: () => void;
  expanded: boolean;
  onToggleExpand: () => void;
  reason: string;
  onReasonChange: (v: string) => void;
  pending: boolean;
  /** 이중 컨펌 대상은 확인 소속을 함께 넘긴다(공론장은 undefined). */
  onApprove: (org?: AdminOrg) => void;
  onReject: () => void;
  onEditApprove: (org?: AdminOrg) => void;
}

export function QueueItemCard(props: QueueItemCardProps) {
  const { item, canModerate, pending } = props;
  const sla = elapsedInfo(item.createdAt);
  const flag = typeof item.meta.flagReason === "string" ? item.meta.flagReason : null;
  const bannedHit = item.target === "podcast" && hasBannedHit(detailStr(item.detail, "script"));
  const editable = item.target === "crossview" || item.target === "podcast";
  // 이중 컨펌 — 크로스뷰·팟캐스트만. 공론장은 기존 단일 승인 그대로.
  const dual = isDualTarget(item.target);
  const confirms = readConfirmations(item);
  const myOrgs = CONFIRM_ORGS.filter((org) => canConfirmAs(props.viewer, org));
  // 소속 미지정 관리자는 확인할 수 없다 — 이유를 행에 적어 준다.
  const noOrgHint =
    dual && canModerate && myOrgs.length === 0 ? confirmBlockReason(props.viewer, "okinews") : null;

  // 반려 사유 칸 — "반려" 를 누르면 펼치고, 사유가 있으면 두 번째 누름이 실제 반려다.
  const [rejectOpen, setRejectOpen] = useState(false);
  const reasonReady = props.reason.trim().length > 0;
  const showReason = rejectOpen || reasonReady;
  const rejectId = `reject-${item.id}`;

  function onRejectClick() {
    if (!showReason) {
      setRejectOpen(true);
      return;
    }
    if (!reasonReady) return;
    props.onReject();
  }

  return (
    <article
      className={`ad-item${canModerate ? "" : " no-check"}`}
      data-selected={props.selected ? "true" : undefined}
      data-sla={sla.danger ? "over" : undefined}
    >
      {canModerate && (
        <input
          type="checkbox"
          className="ad-check"
          aria-label={`${item.title} 일괄 선택`}
          checked={props.selected}
          disabled={!props.selectable}
          onChange={props.onToggleSelect}
          title={props.selectable ? undefined : props.blockReason}
        />
      )}
      <div className="ad-item-body">
        <p className="ad-eyebrow">
          <span className="ad-tag">{TARGET_LABEL[item.target]}</span>
          <span className="ad-wait" data-over={sla.danger ? "true" : undefined}>
            {sla.danger ? "SLA 초과 · " : ""}
            {sla.label}
          </span>
          {flag && (
            <span className="ad-chip" data-tone="danger">
              {FLAG_LABEL[flag] ?? flag}
            </span>
          )}
          {bannedHit && (
            <span className="ad-chip" data-tone="warn">
              금칙어 히트
            </span>
          )}
          {dual && <ConfirmBadges item={item} />}
        </p>
        <h3 className="ad-item-title">{item.title}</h3>
        {item.target === "crossview" ? (
          <CrossviewGlance item={item} />
        ) : (
          <>
            {item.preview && <p className="ad-preview">{item.preview}</p>}
            <MetaChips item={item} />
          </>
        )}

        <div>
          <button
            type="button"
            onClick={props.onToggleExpand}
            aria-expanded={props.expanded}
            className="ad-textbtn is-quiet"
          >
            {props.expanded ? "미리보기 접기 ▲" : "미리보기 펼치기 ▼"}
          </button>
        </div>
        {props.expanded && <QueuePreview item={item} />}

        {canModerate && (
          <>
            {noOrgHint && <p className="ad-hint is-warn">{noOrgHint}</p>}
            <div className="ad-actions">
              {dual ? (
                // 소속별 확인 버튼 — 내 소속만(super_admin 은 둘 다). 상대 소속은 위 칩으로 읽는다.
                CONFIRM_ORGS.map((org) => {
                  const done = Boolean(confirms[org]);
                  const allowed = canConfirmAs(props.viewer, org);
                  if (!allowed) return null;
                  return (
                    <Button
                      key={org}
                      size="sm"
                      variant={done ? "outline" : "primary"}
                      disabled={pending || done}
                      title={done ? `${ORG_LABEL[org]} 확인 완료` : undefined}
                      onClick={() => props.onApprove(org)}
                    >
                      {done ? `${ORG_LABEL[org]} 확인됨 ✓` : `${ORG_LABEL[org]} 확인`}
                    </Button>
                  );
                })
              ) : (
                <Button size="sm" disabled={pending} onClick={() => props.onApprove()}>
                  {pending ? "처리 중…" : "승인"}
                </Button>
              )}
              {editable &&
                myOrgs.map((org) => (
                  <button
                    key={`edit-${org}`}
                    type="button"
                    className="ad-textbtn"
                    disabled={pending}
                    title="내용을 고친 뒤 확인합니다. 내용이 바뀌면 상대 사(社)의 확인은 무효가 됩니다."
                    onClick={() => props.onEditApprove(org)}
                  >
                    {myOrgs.length > 1 ? `${ORG_LABEL[org]} 수정확인` : "수정 후 확인"}
                  </button>
                ))}
              <span className="ad-spacer" />
              <button
                type="button"
                className="ad-textbtn is-danger"
                disabled={pending || (showReason && !reasonReady)}
                aria-expanded={showReason}
                aria-controls={rejectId}
                onClick={onRejectClick}
                title={showReason && !reasonReady ? "반려 사유를 입력하세요" : undefined}
              >
                {showReason ? "반려 확정" : "반려"}
              </button>
            </div>
            {showReason && (
              <div className="ad-reason">
                <label htmlFor={rejectId}>반려 사유 (필수 — 감사 로그에 남습니다)</label>
                <textarea
                  id={rejectId}
                  value={props.reason}
                  onChange={(e) => props.onReasonChange(e.target.value)}
                  placeholder="왜 반려하는지 한 줄로"
                  rows={2}
                  autoFocus={rejectOpen && !reasonReady}
                  className="ad-field"
                  style={{ resize: "vertical" }}
                />
              </div>
            )}
          </>
        )}
      </div>
    </article>
  );
}
