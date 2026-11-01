"use client";

// ============================================================================
// app/admin/_components/edit-approve-dialog — 수정승인 인라인 에디터
//
// 출처: REQ(F7) — 검수 큐 수정승인 (이슈 #34)
//
// 크로스뷰(summary_macro·summary_micro·reading_point) / 팟캐스트(title·script) 를
// 인라인 편집한 뒤 승인한다. 확정 시 편집값(edits)을 상위로 전달한다.
// 포커스 트랩·ESC·오버레이 닫기는 shadcn(Radix) Dialog 가 담당한다.
// ============================================================================

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FIELD_CLASS, detailStr, type QueueItem } from "./lib";

/** 대상별 편집 필드 정의 (라벨 / 컬럼 / 여러 줄 여부) */
interface FieldDef {
  key: string;
  label: string;
  multiline: boolean;
  rows?: number;
}

const FIELD_DEFS: Record<"crossview" | "podcast", FieldDef[]> = {
  crossview: [
    { key: "reading_point", label: "리딩 포인트", multiline: true, rows: 2 },
    { key: "summary_macro", label: "광역 관점 요약", multiline: true, rows: 4 },
    { key: "summary_micro", label: "기초 관점 요약", multiline: true, rows: 4 },
  ],
  podcast: [
    { key: "title", label: "제목", multiline: false },
    { key: "script", label: "대본", multiline: true, rows: 10 },
  ],
};

/** detail 의 카멜케이스 키 ↔ DB 스네이크 키 매핑 (초기값 로드용) */
const DETAIL_KEY: Record<string, string> = {
  reading_point: "readingPoint",
  summary_macro: "summaryMacro",
  summary_micro: "summaryMicro",
  title: "title",
  script: "script",
};

export function EditApproveDialog({
  item,
  open,
  onOpenChange,
  onConfirm,
  pending,
}: {
  item: QueueItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (edits: Record<string, string>) => void;
  pending: boolean;
}) {
  const target = item?.target === "podcast" ? "podcast" : "crossview";
  const defs = FIELD_DEFS[target];
  const [values, setValues] = useState<Record<string, string>>({});

  // 다이얼로그가 열릴 때 현재 상세값으로 초기화한다.
  useEffect(() => {
    if (!item || !open) return;
    const init: Record<string, string> = {};
    for (const def of FIELD_DEFS[
      item.target === "podcast" ? "podcast" : "crossview"
    ]) {
      init[def.key] = detailStr(item.detail, DETAIL_KEY[def.key] ?? def.key) ?? "";
    }
    setValues(init);
  }, [item, open]);

  if (!item) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>수정승인 — {item.title}</DialogTitle>
          <DialogDescription>
            내용을 수정한 뒤 승인하면 변경 전/후가 감사 로그에 기록됩니다.
          </DialogDescription>
        </DialogHeader>

        <div className="flex max-h-[55vh] flex-col gap-4 overflow-y-auto">
          {defs.map((def) => (
            <div key={def.key} className="flex flex-col gap-1.5">
              <label htmlFor={`edit-${def.key}`} className="ad-k" style={{ textTransform: "none", letterSpacing: 0, fontSize: 13 }}>
                {def.label}
              </label>
              {def.multiline ? (
                <textarea
                  id={`edit-${def.key}`}
                  value={values[def.key] ?? ""}
                  rows={def.rows ?? 3}
                  onChange={(e) =>
                    setValues((p) => ({ ...p, [def.key]: e.target.value }))
                  }
                  className={`${FIELD_CLASS} resize-y`}
                />
              ) : (
                <input
                  id={`edit-${def.key}`}
                  value={values[def.key] ?? ""}
                  onChange={(e) =>
                    setValues((p) => ({ ...p, [def.key]: e.target.value }))
                  }
                  className={`${FIELD_CLASS} h-11`}
                />
              )}
            </div>
          ))}
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" className="min-h-11">
              취소
            </Button>
          </DialogClose>
          <Button
            className="min-h-11"
            disabled={pending}
            onClick={() => onConfirm(values)}
          >
            {pending ? "처리 중…" : "수정 후 승인"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
