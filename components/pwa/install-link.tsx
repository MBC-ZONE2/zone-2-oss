"use client";

// 푸터의 "홈 화면에 추가" — 띠를 닫은 뒤에도 언제든 안내를 열 수 있는 자리.
// 폰이 아니거나 이미 홈 화면 앱이면 그리지 않는다(하이드레이션 뒤 판별 — 서버는 빈 자리).

import { useEffect, useState } from "react";
import { INSTALL_OPEN_EVENT } from "./install-guide";
import { detectPlatform, isMobilePlatform, isStandalone } from "@/lib/pwa/platform";

export function InstallLink() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const sync = () => setShow(isMobilePlatform(detectPlatform()) && !isStandalone());
    sync();
    // 브라우저 메뉴로 설치한 직후에도 링크를 거둔다
    window.addEventListener("appinstalled", sync);
    return () => window.removeEventListener("appinstalled", sync);
  }, []);
  if (!show) return null;
  return (
    <button type="button" className="sf-install" onClick={() => window.dispatchEvent(new Event(INSTALL_OPEN_EVENT))}>
      홈 화면에 추가
    </button>
  );
}
