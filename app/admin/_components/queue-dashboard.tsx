"use client";

// ============================================================================
// app/admin/_components/queue-dashboard — 검수 큐 (클라이언트)
//
// 출처: REQ(F7) — 3버튼 검수 + 미리보기 강화 + SLA + 일괄 처리 (이슈 #34)
//
// 탭(crossview/podcast/forum)별로 대기 목록을 조회하고, 항목별로
// 승인/수정승인/반려 + 대기시간 정렬 + 다중선택 일괄 처리를 제공한다.
// viewer(canModerate=false)는 조회·펼침만 가능(액션 숨김).
//
// 이중 컨펌(회의 결정 [9]) → 2026-10-29 부터 REQUIRED_CONFIRMATIONS=1: 어느 한쪽이 확인하면 바로 발행된다.
// 서버가 { confirmed, pending, published } 를 돌려주므로, (2로 되돌렸을 때) 아직 상대
// 확인이 남았으면 항목을 큐에 남기고 배지만 갱신한다.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "@/components/ui/sonner";
import { QueueItemCard } from "./queue-item-card";
import { EditApproveDialog } from "./edit-approve-dialog";
import { BulkBar } from "./queue-bulk-bar";
import {
  apiFetch,
  hasBannedHit,
  isDualTarget,
  detailStr,
  ORG_LABEL,
  REQUIRED_CONFIRMATIONS,
  type AdminOrg,
  type QueueItem,
  type QueueTarget,
  type QueueViewer,
} from "./lib";
import type { QueueCounts } from "./summary";

const TABS: { type: QueueTarget; label: string }[] = [
  { type: "crossview", label: "크로스뷰" },
  { type: "podcast", label: "팟캐스트" },
  { type: "forum", label: "공론장" },
];

const MAX_BULK = 20;
/** 큐 한 페이지 조회 상한 — 배지 정확도 판정에도 사용 */
const FETCH_LIMIT = 50;

interface QueueResponse {
  type: QueueTarget;
  items: QueueItem[];
  nextCursor: string | null;
  viewer: QueueViewer;
}

/** 검수 액션 응답 — 이중 컨펌 대상이면 확인 현황이 함께 온다. */
interface ModerateResponse {
  statusUpdated: boolean;
  confirmed?: AdminOrg[];
  pending?: AdminOrg[];
  published?: boolean;
}

interface BulkResponse {
  results: {
    targetId: string;
    ok: boolean;
    message?: string;
    published?: boolean;
    confirmed?: AdminOrg[];
  }[];
  summary: { total: number; success: number; failed: number };
}

/** 일괄 처리 제외 여부 판정 (플래그/금칙어) */
function blockInfo(item: QueueItem): { selectable: boolean; reason: string } {
  if (item.target === "forum") {
    return {
      selectable: false,
      reason: "공론장 플래그 항목은 개별 검토가 필요합니다.",
    };
  }
  if (
    item.target === "podcast" &&
    hasBannedHit(detailStr(item.detail, "script"))
  ) {
    return {
      selectable: false,
      reason: "금칙어 히트 항목은 개별 검토가 필요합니다.",
    };
  }
  return { selectable: true, reason: "" };
}

export function QueueDashboard({
  canModerate,
  initialCounts,
}: {
  canModerate: boolean;
  initialCounts?: QueueCounts;
}) {
  const [tab, setTab] = useState<QueueTarget>("crossview");
  const [items, setItems] = useState<QueueItem[]>([]);
  // 이중 컨펌에서 "내가 어느 소속으로 확인할 수 있는지" — 큐 응답이 알려 준다.
  const [viewer, setViewer] = useState<QueueViewer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<"oldest" | "newest">("oldest");
  // 탭별 대기 건수 배지 — 서버 스냅샷으로 초기화하고, 로드/처리에 따라 갱신.
  const [counts, setCounts] = useState<Record<QueueTarget, number>>({
    crossview: initialCounts?.crossview ?? 0,
    podcast: initialCounts?.podcast ?? 0,
    forum: initialCounts?.forum ?? 0,
  });

  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [bulkReason, setBulkReason] = useState("");

  const [editItem, setEditItem] = useState<QueueItem | null>(null);
  /** 수정확인을 누른 소속 (이중 컨펌 대상만; 공론장은 undefined) */
  const [editOrg, setEditOrg] = useState<AdminOrg | undefined>(undefined);
  const [editOpen, setEditOpen] = useState(false);
  const [editPending, setEditPending] = useState(false);

  const load = useCallback(async (type: QueueTarget) => {
    setLoading(true);
    setError(null);
    const res = await apiFetch<QueueResponse>(
      `/api/admin/queue?type=${type}&limit=${FETCH_LIMIT}`,
    );
    if (res.error) {
      setError(res.error.message);
      setItems([]);
    } else {
      const loaded = res.data.items;
      setItems(loaded);
      setViewer(res.data.viewer ?? null);
      // 배지 보정: 한 페이지에 다 담겼으면(< 상한) 실제 건수로 정확히 갱신.
      // 상한에 도달했다면 더 있을 수 있으므로 서버 스냅샷 값을 낮추지 않는다.
      if (loaded.length < FETCH_LIMIT) {
        setCounts((prev) => ({ ...prev, [type]: loaded.length }));
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    setSelected(new Set());
    setExpanded(new Set());
    void load(tab);
  }, [tab, load]);

  const sortedItems = useMemo(() => {
    const copy = [...items];
    copy.sort((a, b) =>
      sort === "oldest"
        ? a.createdAt.localeCompare(b.createdAt)
        : b.createdAt.localeCompare(a.createdAt),
    );
    return copy;
  }, [items, sort]);

  const selectableIds = useMemo(
    () => items.filter((it) => blockInfo(it).selectable).map((it) => it.id),
    [items],
  );

  function removeItems(ids: Set<string>) {
    setItems((prev) => prev.filter((it) => !ids.has(it.id)));
    setSelected(new Set());
    setCounts((prev) => ({
      ...prev,
      [tab]: Math.max(0, prev[tab] - ids.size),
    }));
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < MAX_BULK) next.add(id);
      else toast.warning(`한 번에 최대 ${MAX_BULK}건까지 선택할 수 있습니다.`);
      return next;
    });
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected((prev) => {
      if (prev.size >= Math.min(selectableIds.length, MAX_BULK)) {
        return new Set();
      }
      return new Set(selectableIds.slice(0, MAX_BULK));
    });
  }

  /** 한쪽만 확인된 항목 — 큐에 남기고 확인 배지만 갱신한다. */
  function markConfirmed(id: string, confirmed: AdminOrg[]) {
    const at = new Date().toISOString();
    setItems((prev) =>
      prev.map((it) =>
        it.id === id
          ? {
              ...it,
              meta: {
                ...it.meta,
                confirmations: {
                  okinews: confirmed.includes("okinews") ? at : null,
                  mbc: confirmed.includes("mbc") ? at : null,
                },
              },
            }
          : it,
      ),
    );
  }

  /** 확인/발행 결과를 토스트 문구로 — 상대 확인이 남았으면 그 사실을 알린다. */
  function confirmToast(data: ModerateResponse, doneMessage: string) {
    if (data.published === false && data.pending?.length) {
      const waiting = data.pending.map((org) => ORG_LABEL[org]).join("·");
      toast.success(`확인되었습니다 — ${waiting} 확인 후 발행됩니다.`);
      return;
    }
    toast.success(doneMessage);
  }

  async function moderateSingle(
    item: QueueItem,
    action: "approve" | "reject",
    org?: AdminOrg,
  ) {
    if (!canModerate || pending) return;
    const reason = (reasons[item.id] ?? "").trim();
    if (action === "reject" && !reason) {
      toast.error("반려 사유를 입력해 주세요.");
      return;
    }
    setPending(item.id);
    const res = await apiFetch<ModerateResponse>("/api/admin/moderate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        target: item.target,
        targetId: item.id,
        action,
        reason: reason || undefined,
        org,
      }),
    });
    setPending(null);
    if (res.error) {
      toast.error(res.error.message);
      return;
    }
    // 이중 컨펌: 아직 상대 확인이 남았으면 큐에서 빼지 않는다.
    if (action === "approve" && res.data.published === false) {
      markConfirmed(item.id, res.data.confirmed ?? []);
      confirmToast(res.data, "승인되었습니다.");
      return;
    }
    removeItems(new Set([item.id]));
    toast.success(action === "approve" ? "승인되었습니다." : "반려되었습니다.");
  }

  async function confirmEdit(edits: Record<string, string>) {
    if (!editItem) return;
    setEditPending(true);
    const res = await apiFetch<ModerateResponse>("/api/admin/moderate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        target: editItem.target,
        targetId: editItem.id,
        action: "edit_approve",
        edits,
        org: editOrg,
      }),
    });
    setEditPending(false);
    if (res.error) {
      toast.error(res.error.message);
      return;
    }
    // 이중 컨펌: 상대 확인이 남았으면 큐에 남긴다(내용을 고쳤다면 상대 확인은 초기화).
    if (res.data.published === false) {
      markConfirmed(editItem.id, res.data.confirmed ?? []);
      confirmToast(res.data, "수정 후 승인되었습니다.");
    } else {
      removeItems(new Set([editItem.id]));
      toast.success("수정 후 승인되었습니다.");
    }
    setEditOpen(false);
    setEditItem(null);
  }

  async function bulkProcess(action: "approve" | "reject") {
    if (pending || selected.size === 0) return;
    if (action === "reject" && !bulkReason.trim()) {
      toast.error("일괄 반려 사유를 입력해 주세요.");
      return;
    }
    // 이중 컨펌: super_admin 은 확인 주체를 골라야 하므로 일괄 승인 대상이 아니다.
    if (action === "approve" && isDualTarget(tab) && viewer?.canConfirmBoth) {
      toast.warning(
        "관리자 계정은 확인 주체를 선택해야 합니다 — 항목별 확인 버튼을 사용해 주세요.",
      );
      return;
    }
    setPending("bulk");
    const payload = [...selected]
      .map((id) => items.find((it) => it.id === id))
      .filter((it): it is QueueItem => Boolean(it))
      .map((it) => ({
        target: it.target,
        targetId: it.id,
        action,
        reason: action === "reject" ? bulkReason.trim() : undefined,
      }));
    const res = await apiFetch<BulkResponse>("/api/admin/moderate/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: payload }),
    });
    setPending(null);
    if (res.error) {
      toast.error(res.error.message);
      return;
    }
    // 발행까지 간 항목만 큐에서 뺀다 — 한쪽 확인만 기록된 항목은 남겨 배지를 갱신.
    const done = res.data.results.filter((r) => r.ok && r.published !== false);
    const waiting = res.data.results.filter((r) => r.ok && r.published === false);
    removeItems(new Set(done.map((r) => r.targetId)));
    for (const r of waiting) markConfirmed(r.targetId, r.confirmed ?? []);
    setSelected(new Set());
    setBulkReason("");
    const { success, failed } = res.data.summary;
    if (failed > 0) toast.warning(`${success}건 처리 · ${failed}건 실패`);
    else if (waiting.length > 0)
      toast.success(`${success}건 확인 — ${waiting.length}건은 상대 확인 대기`);
    else toast.success(`${success}건 처리되었습니다.`);
  }

  return (
    <section>
      {/* 안내 한 줄 — 제목은 위 영역 탭이 이미 말했다. 필요한 규칙만 짧게 */}
      <p className="ad-lede">
        AI 생성물과 플래그된 게시물을 승인·수정승인·반려합니다.
        {!canModerate && " 현재 역할은 조회 전용입니다."}
        {isDualTarget(tab) && (
          <>
            {" "}
            {REQUIRED_CONFIRMATIONS > 1 ? (
              <>크로스뷰·팟캐스트는 <strong>{ORG_LABEL.okinews}과 {ORG_LABEL.mbc} 양측 확인</strong>이 모두 끝나야 발행됩니다.</>
            ) : (
              <>크로스뷰·팟캐스트는 <strong>{ORG_LABEL.okinews}·{ORG_LABEL.mbc} 중 한쪽이 확인</strong>하면 바로 공개됩니다(되돌리기 가능).</>
            )}
          </>
        )}
      </p>
      {canModerate && viewer && !viewer.canConfirmBoth && !viewer.org && (
        <p role="alert" className="ad-note">
          소속이 지정되지 않은 계정입니다 — 계정·권한 관리에서 {ORG_LABEL.okinews}/{ORG_LABEL.mbc} 소속을 지정해야 확인할 수
          있습니다.
        </p>
      )}

      {/* 검수 대상 탭 + 정렬 */}
      <div className="ad-tabs" style={{ marginTop: 20 }}>
        <div role="tablist" aria-label="검수 대상" style={{ display: "contents" }}>
          {TABS.map(({ type, label }) => {
            const selectedTab = tab === type;
            const n = counts[type];
            return (
              <button key={type} type="button" role="tab" aria-selected={selectedTab} onClick={() => setTab(type)}>
                {label}
                {n > 0 && <b>{n}</b>}
              </button>
            );
          })}
        </div>
        <label className="ad-tabs-r">
          정렬
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as "oldest" | "newest")}
            className="ad-select"
            style={{ minHeight: 36 }}
          >
            <option value="oldest">오래 대기한 순</option>
            <option value="newest">최근 등록순</option>
          </select>
        </label>
      </div>

      {canModerate && (
        <BulkBar
          selectedCount={selected.size}
          selectableCount={selectableIds.length}
          maxBulk={MAX_BULK}
          bulkReason={bulkReason}
          onBulkReasonChange={setBulkReason}
          onToggleAll={toggleSelectAll}
          onApprove={() => bulkProcess("approve")}
          onReject={() => bulkProcess("reject")}
          pending={pending === "bulk"}
        />
      )}

      {error && (
        <p role="alert" className="ad-error" style={{ marginTop: 16 }}>
          {error}
        </p>
      )}

      {loading ? (
        <ul className="ad-pending" aria-hidden style={{ marginTop: 16 }}>
          {[0, 1, 2].map((i) => (
            <li key={i} style={{ height: 120 }} />
          ))}
        </ul>
      ) : sortedItems.length === 0 ? (
        <div className="ad-empty" style={{ marginTop: 16 }}>
          <strong>검수할 항목이 없습니다</strong>
          <span>
            {TABS.find((t) => t.type === tab)?.label} 대기열이 비어 있습니다. 새 항목이 들어오면 여기에
            표시됩니다.
          </span>
        </div>
      ) : (
        <ul className="ad-list" style={{ marginTop: 16 }}>
          {sortedItems.map((item) => {
            const block = blockInfo(item);
            return (
              <li key={item.id}>
                <QueueItemCard
                  item={item}
                  canModerate={canModerate}
                  selectable={block.selectable}
                  blockReason={block.reason}
                  selected={selected.has(item.id)}
                  onToggleSelect={() => toggleSelect(item.id)}
                  expanded={expanded.has(item.id)}
                  onToggleExpand={() => toggleExpand(item.id)}
                  reason={reasons[item.id] ?? ""}
                  onReasonChange={(v) => setReasons((p) => ({ ...p, [item.id]: v }))}
                  pending={pending === item.id}
                  viewer={viewer}
                  onApprove={(org) => moderateSingle(item, "approve", org)}
                  onReject={() => moderateSingle(item, "reject")}
                  onEditApprove={(org) => {
                    setEditItem(item);
                    setEditOrg(org);
                    setEditOpen(true);
                  }}
                />
              </li>
            );
          })}
        </ul>
      )}

      <EditApproveDialog
        item={editItem}
        open={editOpen}
        onOpenChange={(o) => {
          setEditOpen(o);
          if (!o) {
            setEditItem(null);
            setEditOrg(undefined);
          }
        }}
        onConfirm={confirmEdit}
        pending={editPending}
      />
    </section>
  );
}
