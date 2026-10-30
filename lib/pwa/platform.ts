// ============================================================================
// lib/pwa/platform — 홈 화면 설치 안내가 어느 길을 보여 줄지 고르는 판별(브라우저 전용)
//
// 아이폰은 설치 API 가 없어 "공유 → 홈 화면에 추가" 를 글로 안내하고, 안드로이드 Chrome 은
// beforeinstallprompt 가 오면 바로 설치창을 띄운다. 카카오톡·네이버 같은 앱 안 브라우저는
// 둘 다 안 되므로 "다른 브라우저로 열기" 부터 안내한다. UA 판별은 안내 문구를 고르는 용도일 뿐
// 기능을 막지 않는다 — 잘못 짚어도 독자가 다른 길의 안내를 보는 정도다.
// ============================================================================

export type InstallPlatform =
  | "ios-safari" // 아이폰 Safari — 공유 → 홈 화면에 추가
  | "ios-browser" // 아이폰의 Chrome·Edge 등 — 공유 메뉴에 같은 항목(iOS 16.4+), 안 보이면 Safari
  | "ios-inapp" // 아이폰 앱 안 브라우저(카카오톡·네이버·인스타) — Safari 로 열기부터
  | "android-chrome" // 안드로이드 Chrome(또는 Chromium 계열) — 설치창 또는 ⋮ 메뉴
  | "android-samsung" // 삼성 인터넷 — ≡ 메뉴 → 현재 페이지 추가
  | "android-inapp" // 안드로이드 앱 안 브라우저 — 다른 브라우저로 열기부터
  | "desktop"; // 데스크탑 — 안내하지 않는다(브라우저 주소창에 설치 아이콘이 있다)

const INAPP = /KAKAOTALK|NAVER\(|Instagram|FBAN|FBAV|FB_IAB|Line\/|DaumApps|Whale\/.*Mobile.*inapp/i;

/** 이미 홈 화면 앱으로 열렸는가 */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || window.matchMedia?.("(display-mode: standalone)").matches === true;
}

export function detectPlatform(ua: string = typeof navigator === "undefined" ? "" : navigator.userAgent): InstallPlatform {
  const touchMac =
    typeof navigator !== "undefined" && navigator.platform === "MacIntel" && (navigator.maxTouchPoints ?? 0) > 1;
  const ios = /iPad|iPhone|iPod/.test(ua) || touchMac;
  const inapp = INAPP.test(ua);
  if (ios) {
    if (inapp) return "ios-inapp";
    if (/CriOS|FxiOS|EdgiOS|OPT\/|YaBrowser/i.test(ua)) return "ios-browser";
    return "ios-safari";
  }
  if (/Android/i.test(ua)) {
    if (inapp) return "android-inapp";
    if (/SamsungBrowser/i.test(ua)) return "android-samsung";
    return "android-chrome";
  }
  return "desktop";
}

export function isMobilePlatform(p: InstallPlatform): boolean {
  return p !== "desktop";
}
