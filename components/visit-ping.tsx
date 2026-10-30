"use client";

// ============================================================================
// components/visit-ping — 하루 1회 익명 방문 신호 (검증지표 ④ 재방문율, #181)
//
// localStorage 에 무작위 UUID(z2_vid) 하나를 두고, KST 날짜(z2_vday)가 바뀐 첫 화면에서만
// POST /api/visit 로 보낸다(하루 1요청). 서버는 해시와 날짜만 남긴다(lib/visits).
// localStorage 가 막힌 브라우저(사생활 보호 모드 등)는 조용히 건너뛴다. /admin 은 세지 않는다.
// 화면에는 아무것도 그리지 않는다.
// ============================================================================

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { VISIT_DAY_KEY, VISIT_ID_KEY, isExcludedPath, kstDateOf } from "@/lib/visits";

export function VisitPing() {
  const pathname = usePathname() ?? "/";

  useEffect(() => {
    if (isExcludedPath(pathname)) return;
    if (typeof window === "undefined") return;
    try {
      const today = kstDateOf();
      if (window.localStorage.getItem(VISIT_DAY_KEY) === today) return;

      let id = window.localStorage.getItem(VISIT_ID_KEY);
      if (!id) {
        if (typeof window.crypto?.randomUUID !== "function") return;
        id = window.crypto.randomUUID();
        window.localStorage.setItem(VISIT_ID_KEY, id);
      }

      const payload = JSON.stringify({ id, path: pathname });
      let sent = false;
      if (typeof navigator.sendBeacon === "function") {
        sent = navigator.sendBeacon("/api/visit", new Blob([payload], { type: "application/json" }));
      }
      if (sent) {
        // 큐에 들어갔다 — 서버가 무시해도(봇·초과) 오늘은 재시도하지 않는다
        window.localStorage.setItem(VISIT_DAY_KEY, today);
        return;
      }
      void fetch("/api/visit", {
        method: "POST",
        body: payload,
        headers: { "content-type": "application/json" },
        keepalive: true,
      })
        .then((res) => {
          // 네트워크 실패면 날짜를 남기지 않아 다음 화면에서 다시 시도한다
          if (res.ok) window.localStorage.setItem(VISIT_DAY_KEY, today);
        })
        .catch(() => {});
    } catch {
      // localStorage 접근 불가 — 기록하지 않는다
    }
  }, [pathname]);

  return null;
}
