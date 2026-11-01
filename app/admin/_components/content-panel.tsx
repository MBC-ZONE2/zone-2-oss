"use client";

// ============================================================================
// app/admin/_components/content-panel — 콘텐츠 관리 (발행/반려 이력 + 롤백, 「일점 지면」)
//
// 출처: REQ(F7) — 콘텐츠 관리 탭 (이슈 #34)
//
// 크로스뷰·팟캐스트의 발행/반려 이력을 조회·검색하고, 발행 항목을 검수로
// 되돌린다(롤백). 롤백은 content.rollback 권한자(관리자·양사 기자 — 한쪽 단독, 2026-10-19)에게 노출된다.
// 필터 줄(select·검색) → 괘선 행 목록(대상 · 상태 · 제목 · 처리 시각 · 되돌리기).
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import { toast } from "@/components/ui/sonner";
import { RollbackDialog } from "./rollback-dialog";
import { ORG_LABEL, REQUIRED_CONFIRMATIONS } from "@/lib/auth/roles";
import { apiFetch, fmtDateTime, TARGET_LABEL, type ContentItem } from "./lib";

interface ContentResponse {
  items: ContentItem[];
}

const TYPE_OPTIONS = [
  { value: "all", label: "전체 유형" },
  { value: "crossview", label: "크로스뷰" },
  { value: "podcast", label: "팟캐스트" },
];

const STATUS_OPTIONS = [
  { value: "all", label: "전체 상태" },
  { value: "published", label: "발행됨" },
  { value: "rejected", label: "반려됨" },
];

export function ContentPanel({ canRollback }: { canRollback: boolean }) {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");

  const [target, setTarget] = useState<ContentItem | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pending, setPending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ type, status });
    if (q) params.set("q", q);
    const res = await apiFetch<ContentResponse>(`/api/admin/content?${params}`);
    if (res.error) {
      setError(res.error.message);
      setItems([]);
    } else {
      setItems(res.data.items);
    }
    setLoading(false);
  }, [type, status, q]);

  useEffect(() => {
    void load();
  }, [load]);

  async function confirmRollback(reason: string) {
    if (!target) return;
    setPending(true);
    const res = await apiFetch("/api/admin/content/rollback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target: target.target, targetId: target.id, reason }),
    });
    setPending(false);
    if (res.error) {
      toast.error(res.error.message);
      return;
    }
    setItems((prev) => prev.filter((it) => it.id !== target.id));
    setDialogOpen(false);
    setTarget(null);
    toast.success("검수 상태로 되돌렸습니다.");
  }

  return (
    <section>
      <div className="ad-section-head">
        <div>
          <h2>콘텐츠 관리</h2>
          <p>
            발행·반려된 AI 콘텐츠 이력입니다.
            {canRollback
              ? ` 발행 항목은 '되돌리기'로 검수 상태로 내릴 수 있습니다 — ${ORG_LABEL.okinews}·${ORG_LABEL.mbc} 어느 한쪽이든 단독으로 되돌릴 수 있고, 다시 공개하려면 ${REQUIRED_CONFIRMATIONS > 1 ? "양측" : "한쪽"} 확인이 필요합니다.`
              : " 되돌리기는 관리자·양사 기자 계정에서 할 수 있습니다."}
          </p>
        </div>
        {!loading && !error && <span className="ad-r">{items.length}건</span>}
      </div>

      <form
        className="ad-filters"
        onSubmit={(e) => {
          e.preventDefault();
          setQ(search.trim());
        }}
      >
        <select value={type} onChange={(e) => setType(e.target.value)} aria-label="유형 필터" className="ad-select">
          {TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label="상태 필터"
          className="ad-select"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="제목 검색"
          aria-label="제목 검색"
          className="ad-field"
        />
        <button type="submit" className="ad-textbtn">
          검색
        </button>
      </form>

      {error && (
        <p role="alert" className="ad-error" style={{ marginTop: 16 }}>
          {error}
        </p>
      )}

      {loading ? (
        <ul className="ad-pending" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <li key={i} style={{ height: 56 }} />
          ))}
        </ul>
      ) : items.length === 0 ? (
        <div className="ad-empty">
          <strong>조건에 맞는 콘텐츠가 없습니다</strong>
        </div>
      ) : (
        <ul className="ad-rows" style={{ borderTop: 0 }}>
          {items.map((item) => (
            <li key={`${item.target}-${item.id}`} className="ad-row">
              <span className="ad-tag">{TARGET_LABEL[item.target]}</span>
              <span className="ad-status" data-s={item.status}>
                {item.status === "published" ? "발행됨" : "반려됨"}
              </span>
              <span className="ad-row-t" title={item.title}>
                {item.title}
              </span>
              <time dateTime={item.processedAt}>{fmtDateTime(item.processedAt)}</time>
              {canRollback && item.canRollback && (
                <button
                  type="button"
                  className="ad-textbtn is-danger"
                  onClick={() => {
                    setTarget(item);
                    setDialogOpen(true);
                  }}
                >
                  되돌리기
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <RollbackDialog
        item={target}
        open={dialogOpen}
        onOpenChange={(o) => {
          setDialogOpen(o);
          if (!o) setTarget(null);
        }}
        onConfirm={confirmRollback}
        pending={pending}
      />
    </section>
  );
}
