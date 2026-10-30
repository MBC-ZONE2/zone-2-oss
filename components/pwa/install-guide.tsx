"use client";

// ============================================================================
// components/pwa/install-guide — 홈 화면 설치 안내(대표 요청 2026-10-21: "설치가 안 되어 있으면
// 팝업이나 버튼으로 가이드")
//
// 두 부품, 한 파일:
//   <InstallBand>  하단 네비 바로 위 종이색 띠 48px — "홈 화면에 추가하면 앱처럼 열립니다 · 추가하기 · ×".
//                  보이는 동안 <html data-install-band> 를 세워 reels.css 가 하단 여백을 48px 더한다
//                  (「지금 읽는 단락」 띠와 같은 자리라 그 띠가 뜨면 이 띠는 물러난다).
//   <InstallSheet> 플랫폼별 순서 안내(바닥 시트). 띠의 "추가하기", 푸터의 "홈 화면에 추가"(install-link)가 연다.
//
// 보이는 조건(띠): 홈 화면 앱이 아니고 · 폰이고 · 설치 기록이 없고 · 30일 안에 닫은 적이 없고 ·
//   처음 들어온 화면이 아닐 것(첫 방문 첫 화면은 기록만 남긴다 — 인트로 위에 띠를 얹지 않는다).
// 안드로이드 Chrome: beforeinstallprompt 를 붙잡아 두었다가 "추가하기"에서 바로 설치창(prompt)을 띄운다.
//   설치 이벤트(appinstalled)가 오면 기록하고 다시는 띄우지 않는다. 이벤트가 안 온 기기는 ⋮ 메뉴 안내.
// 아이폰: 설치 API 가 없다 — Safari 공유 → 홈 화면에 추가 순서를 글로. 앱 안 브라우저는 Safari 로 열기부터.
// 기록은 localStorage "zone2.pwa.v1" 한 칸(JSON). 막힌 브라우저(사생활 보호)는 띠를 띄우지 않는다.
// 스타일 app/pwa.css(.pwa-*). 데스크탑(≥1100)은 CSS 로 숨긴다 — 주소창 설치 아이콘이 있다.
// ============================================================================

import "@/app/pwa.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { detectPlatform, isMobilePlatform, isStandalone, type InstallPlatform } from "@/lib/pwa/platform";

const STORE_KEY = "zone2.pwa.v1";
const DISMISS_DAYS = 30;
/** 푸터 링크 등 바깥에서 시트를 여는 이벤트 */
export const INSTALL_OPEN_EVENT = "zone2:pwa-install";

interface Store {
  first?: string; // 처음 본 시각
  dismissedAt?: string;
  installed?: boolean;
}

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** 안드로이드 설치 이벤트 — 하이드레이션 전에 올 수 있어 모듈 변수에 붙잡아 둔다 */
let deferredPrompt: BeforeInstallPromptEvent | null = null;
const promptListeners = new Set<() => void>();
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    promptListeners.forEach((fn) => fn());
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    writeStore({ installed: true });
    promptListeners.forEach((fn) => fn());
  });
}

function readStore(): Store | null {
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as Store) : {};
  } catch {
    return null; // 저장소가 막힌 브라우저 — 띠를 띄우지 않는다
  }
}
function writeStore(patch: Store): void {
  try {
    const cur = readStore() ?? {};
    window.localStorage.setItem(STORE_KEY, JSON.stringify({ ...cur, ...patch }));
  } catch {
    /* 무시 */
  }
}

function shouldShowBand(platform: InstallPlatform): boolean {
  if (isStandalone() || !isMobilePlatform(platform)) return false;
  const s = readStore();
  if (s === null) return false;
  if (s.installed) return false;
  if (s.dismissedAt && Date.now() - Date.parse(s.dismissedAt) < DISMISS_DAYS * 86400_000) return false;
  if (!s.first) {
    writeStore({ first: new Date().toISOString() });
    return false; // 첫 화면은 기록만
  }
  return true;
}

/** 설치창을 띄운다. 이벤트는 한 번만 쓸 수 있어 거절해도 소모된다 — 그 뒤엔 메뉴 안내(시트)로 넘어간다 */
async function tryNativePrompt(): Promise<"accepted" | "dismissed" | "none"> {
  const p = deferredPrompt;
  if (!p) return "none";
  deferredPrompt = null;
  promptListeners.forEach((fn) => fn());
  try {
    await p.prompt();
    const { outcome } = await p.userChoice;
    if (outcome === "accepted") writeStore({ installed: true });
    return outcome;
  } catch {
    return "none";
  }
}

export function InstallGuide() {
  const [platform, setPlatform] = useState<InstallPlatform>("desktop");
  const [band, setBand] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [canPrompt, setCanPrompt] = useState(false);

  // 판별·띠 여부 — 인트로가 덮고 있는 동안(data-intro-pending)은 기다렸다가 띄운다
  useEffect(() => {
    const p = detectPlatform();
    setPlatform(p);
    setCanPrompt(deferredPrompt !== null);
    // 설치 이벤트가 오거나(appinstalled) 설치창을 쓰고 나면 상태를 맞춘다 — 설치됐으면 띠를 내린다
    const onPrompt = () => {
      setCanPrompt(deferredPrompt !== null);
      if (readStore()?.installed) setBand(false);
    };
    promptListeners.add(onPrompt);

    let timer = 0;
    const tryShow = () => {
      if (document.documentElement.hasAttribute("data-intro-pending")) {
        timer = window.setTimeout(tryShow, 1000);
        return;
      }
      if (shouldShowBand(p)) setBand(true);
    };
    timer = window.setTimeout(tryShow, 1500);

    const open = () => setSheet(true);
    window.addEventListener(INSTALL_OPEN_EVENT, open);
    return () => {
      window.clearTimeout(timer);
      promptListeners.delete(onPrompt);
      window.removeEventListener(INSTALL_OPEN_EVENT, open);
    };
  }, []);

  // 띠가 보이는 동안 html 에 표시 → 하단 여백. 「지금 읽는 단락」 띠(data-now-line)가 뜨면 물러난다
  useEffect(() => {
    if (!band) return;
    const root = document.documentElement;
    const sync = () => {
      if (root.hasAttribute("data-now-line")) root.removeAttribute("data-install-band");
      else root.setAttribute("data-install-band", "1");
    };
    sync();
    const mo = new MutationObserver(sync);
    mo.observe(root, { attributes: true, attributeFilter: ["data-now-line"] });
    return () => {
      mo.disconnect();
      root.removeAttribute("data-install-band");
    };
  }, [band]);

  const dismiss = useCallback(() => {
    writeStore({ dismissedAt: new Date().toISOString() });
    setBand(false);
  }, []);

  const add = useCallback(async () => {
    const r = await tryNativePrompt();
    if (r === "accepted") {
      setBand(false);
      return;
    }
    setSheet(true); // 설치창이 없거나(아이폰) 거절했으면 메뉴 순서 안내
  }, []);

  if (!isMobilePlatform(platform)) return null;
  return (
    <>
      {band && (
        <div className="pwa-band" role="status">
          <span className="pwa-band-text">홈 화면에 추가하면 앱처럼 열립니다</span>
          <button type="button" className="pwa-band-add" onClick={add}>
            추가하기
          </button>
          <button type="button" className="pwa-band-x" onClick={dismiss} aria-label="안내 닫기">
            ×
          </button>
        </div>
      )}
      {sheet && <InstallSheet platform={platform} canPrompt={canPrompt} onClose={() => setSheet(false)} />}
    </>
  );
}

/** 플랫폼별 순서 — 번호는 실제 누르는 순서다 */
function stepsFor(platform: InstallPlatform): { title: string; note?: string; steps: string[] } {
  switch (platform) {
    case "ios-safari":
      return {
        title: "아이폰 홈 화면에 추가하기",
        steps: [
          "화면 아래 가운데 공유 버튼을 누르세요. 네모에서 화살표가 위로 나온 모양입니다.",
          "목록을 아래로 내려 「홈 화면에 추가」를 누르세요.",
          "오른쪽 위 「추가」를 누르면 홈 화면에 ZONE-2 아이콘이 생깁니다.",
        ],
      };
    case "ios-browser":
      return {
        title: "아이폰 홈 화면에 추가하기",
        note: "공유 메뉴에 「홈 화면에 추가」가 없으면 이 주소를 Safari 에서 열어 주세요.",
        steps: [
          "주소창 옆 공유 버튼을 누르세요. 네모에서 화살표가 위로 나온 모양입니다.",
          "목록에서 「홈 화면에 추가」를 누르세요.",
          "오른쪽 위 「추가」를 누르면 홈 화면에 ZONE-2 아이콘이 생깁니다.",
        ],
      };
    case "ios-inapp":
      return {
        title: "Safari 로 열어서 추가하기",
        note: "카카오톡·네이버처럼 앱 안에서 연 화면에서는 홈 화면에 추가할 수 없습니다.",
        steps: [
          "오른쪽 아래(또는 위) ⋯ 메뉴에서 「Safari로 열기」 또는 「다른 브라우저로 열기」를 누르세요.",
          "Safari 에서 화면 아래 가운데 공유 버튼을 누르세요.",
          "「홈 화면에 추가」 → 오른쪽 위 「추가」를 누르면 끝입니다.",
        ],
      };
    case "android-samsung":
      return {
        title: "안드로이드 홈 화면에 추가하기",
        steps: [
          "화면 아래 ≡ 메뉴를 누르세요.",
          "「현재 페이지 추가」를 누르세요.",
          "「홈 화면」을 고르고 「추가」를 누르면 홈 화면에 ZONE-2 아이콘이 생깁니다.",
        ],
      };
    case "android-inapp":
      return {
        title: "Chrome 으로 열어서 추가하기",
        note: "카카오톡·네이버처럼 앱 안에서 연 화면에서는 설치가 되지 않습니다.",
        steps: [
          "오른쪽 아래(또는 위) ⋯ 메뉴에서 「다른 브라우저로 열기」를 누르세요.",
          "Chrome 에서 오른쪽 위 ⋮ 메뉴를 누르세요.",
          "「홈 화면에 추가」 또는 「앱 설치」 → 「설치」를 누르면 끝입니다.",
        ],
      };
    case "android-chrome":
    default:
      return {
        title: "안드로이드 홈 화면에 추가하기",
        steps: [
          "오른쪽 위 ⋮ 메뉴를 누르세요.",
          "「홈 화면에 추가」 또는 「앱 설치」를 누르세요.",
          "「설치」를 누르면 홈 화면에 ZONE-2 아이콘이 생깁니다.",
        ],
      };
  }
}

function InstallSheet({ platform, canPrompt, onClose }: { platform: InstallPlatform; canPrompt: boolean; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [copied, setCopied] = useState(false);
  const { title, note, steps } = stepsFor(platform);
  const inapp = platform === "ios-inapp" || platform === "android-inapp";

  const panelRef = useRef<HTMLDivElement>(null);
  const [promptGone, setPromptGone] = useState(false);
  const showPrompt = canPrompt && !promptGone;

  // 포커스: 열리면 닫기 버튼, Tab 은 시트 안에서 돌고, 닫히면 열었던 자리로 돌아간다
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const items = panelRef.current.querySelectorAll<HTMLElement>("button, [href], [tabindex]:not([tabindex='-1'])");
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      opener?.focus?.();
    };
  }, [onClose]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.origin + "/");
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="pwa-sheet" role="dialog" aria-modal="true" aria-labelledby="pwa-sheet-title">
      <button type="button" className="pwa-sheet-bg" onClick={onClose} aria-label="안내 닫기" tabIndex={-1} />
      <div className="pwa-sheet-panel" ref={panelRef}>
        <div className="pwa-sheet-head">
          <h2 id="pwa-sheet-title" className="pwa-sheet-title">
            {title}
          </h2>
          <button ref={closeRef} type="button" className="pwa-sheet-x" onClick={onClose} aria-label="안내 닫기">
            ×
          </button>
        </div>
        <p className="pwa-sheet-lead">홈 화면에 두면 주소를 치지 않고 앱처럼 바로 열립니다. 따로 내려받는 것은 없습니다.</p>
        {note && <p className="pwa-sheet-note">{note}</p>}
        {showPrompt ? (
          <button
            type="button"
            className="pwa-sheet-cta"
            onClick={async () => {
              const r = await tryNativePrompt();
              if (r === "accepted") onClose();
              else setPromptGone(true); // 거절·실패 — 이벤트는 소모됐으니 메뉴 순서를 보여 준다
            }}
          >
            지금 설치하기
          </button>
        ) : (
          <ol className="pwa-steps">
            {steps.map((s, i) => (
              <li key={i} className="pwa-step">
                <span className="pwa-step-n" aria-hidden="true">
                  {i + 1}
                </span>
                <span className="pwa-step-t">{s}</span>
              </li>
            ))}
          </ol>
        )}
        {inapp && (
          <button type="button" className="pwa-sheet-copy" onClick={copy}>
            {copied ? "주소를 복사했습니다" : "주소 복사 (브라우저에 붙여넣기)"}
          </button>
        )}
      </div>
    </div>
  );
}
