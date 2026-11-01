"use client";
import "@/app/wave.css";
import "@/app/shell.css";
// 릴스 전용 내비 — 데스크톱: 좌측 사이드 레일(SideNav) / 모바일: 하단 검은 세계 바(FloatingNav).
// 모든 목적지는 실앱 내부 라우트(외부 "실앱으로 이동" 링크 없음).
// 앱에서 SideNav 는 이 파일 하나뿐이다(ReelsShell 이 마운트) — 데스크톱 레일 하단의
// 재생 원 #side-play 도 여기서 전역 플레이어 컨텍스트를 읽어 직접 렌더한다(.side-play 규칙은
// app/shell.css). 모바일 #fn-play 와 같은 리모컨 규약(탭 = 재생/일시정지, 길게 = /podcast).
//
// 「일점 지면」 네비 문법:
//   - 하단 바는 검은 세계(#0b0d12) 위 활자만(아이콘 없음). 활성 탭은 상단 2px 백색 선.
//   - [결정 8] 데스크탑 좌측 레일도 같은 검은 세계 — 배경 #0b0d12 / 글자 #f4f5f7,
//     보조 설명 #c3c7d1(app/reels.css ≥1100). 마크업은 그대로다(aria-current 만 보고 CSS 가 칠한다).
//   - [피그마 #5·#9] 활성 항목만 본문과 같은 종이 면(#f4f5f7) 블록 + 잉크 글자(#111) —
//     레일에서 본문으로 이어져 보이게 레일 border-right 를 없앴다. 주황 활성 막대는 제거.
//   - [결정 2] 중앙 #fn-play 는 주황 재생 원(64px, 면 #f9a03f + 검정 글리프). 표지(Cover)가
//     이 원의 좌표를 읽어 백색 수렴(clip-path)의 착지점으로 쓴다 → id 는 안정 셀렉터, 바꾸지 말 것.
//   - .is-glow  : 글로우 1회(1.2s). window 이벤트 "zone2:intro-done" 또는
//                 "zone2:fn-glow" 를 받으면 붙는다(reduced-motion 이면 CSS 가 무시).
//   - .is-playing + style --progress(0~1) : 재생 중 진행 링 + 2초 호흡. 전역 플레이어
//     (components/player) 컨텍스트를 읽어 이 컴포넌트가 직접 렌더한다.
//   - #fn-play·#side-play 는 <button>: 탭 = 현재(없으면 최신) 회차 재생/일시정지 /
//     길게(500ms) = /podcast 로 이동. 회차 시트(플레이리스트)는 시범단 #179 로 제거(2026-10-04).
//     길게 누르기는 손가락이 조금 움직여도 취소되지 않게 이동 거리(12px)로만 판정하고(pointerleave 무시),
//     누르는 동안 .is-pressing 으로 원이 살짝 눌려 "길게 누르는 중"임을 보인다.
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  NAV_ITEMS,
  MOBILE_NAV_ITEMS,
  PlayIcon,
  isNavActive,
} from "@/components/shell/nav-config";
import { progressRatio, usePlayer } from "@/components/player/player-provider";
import { NowLineDock } from "@/components/player/now-line";
import { region } from "@/config/region";

/** 사이드 레일 항목 보조 설명(어르신 기준 큰 셀) */
const DESC: Record<string, string> = {
  "/": "한 장씩 보기",
  "/crossview": "같은 사안, 두 시선",
  "/temperature": "지금 뜨거운 이슈",
  "/podcast": region.podcast.seriesName,
  "/forum": "주민 의견 모음",
};

/** 재생 원 글로우 지속(ms) — reels.css @keyframes fn-glow 와 동일 */
const GLOW_MS = 1200;
/** 길게 누르기 판정(ms) — /podcast 로 이동 */
const LONG_PRESS_MS = 500;
/** 길게 누르는 동안 허용하는 손가락 이동(px) — 이보다 크게 움직이면 스크롤 의도로 보고 취소 */
const LONG_PRESS_SLOP = 12;

/**
 * 재생 원 공통 제스처 — 탭 = 재생/일시정지, 길게(500ms) = /podcast.
 * pointerleave 로는 취소하지 않는다(모바일에서 손가락이 1~2px 만 움직여도 leave 가 떠 길게 누르기가
 * 번번이 취소되던 것 — 시범단 #179). 대신 pointerdown 좌표에서 LONG_PRESS_SLOP 넘게 움직일 때만 취소.
 */
function usePlayPress() {
  const router = useRouter();
  const player = usePlayer();
  const timerRef = useRef<number | undefined>(undefined);
  const longRef = useRef(false);
  const originRef = useRef<{ x: number; y: number } | null>(null);
  const [pressing, setPressing] = useState(false);

  const clearPress = () => {
    if (timerRef.current !== undefined) {
      window.clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }
    originRef.current = null;
    setPressing(false);
  };
  useEffect(() => clearPress, []);

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    longRef.current = false;
    clearPress();
    originRef.current = { x: e.clientX, y: e.clientY };
    // 캡처 — 버튼 밖으로 드래그해 놓아도 up/cancel 이 이 버튼으로 와서 타이머가 반드시 정리된다
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* 미지원 */ }
    setPressing(true);
    timerRef.current = window.setTimeout(() => {
      longRef.current = true;
      timerRef.current = undefined;
      setPressing(false);
      router.push("/podcast");
    }, LONG_PRESS_MS);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const o = originRef.current;
    if (!o || timerRef.current === undefined) return;
    if (Math.hypot(e.clientX - o.x, e.clientY - o.y) > LONG_PRESS_SLOP) clearPress();
  };
  const onClick = () => {
    if (longRef.current) {
      longRef.current = false; // 길게 누르기가 발화했으면 뒤따르는 click 은 무시
      return;
    }
    player.toggle();
  };
  // 발화 뒤 click 없이 cancel 로 끝나면(iOS 스크롤 전환 등) 억제 플래그가 다음 키보드 Enter 를 삼킨다 — 여기서 푼다
  const onPointerCancel = () => {
    clearPress();
    longRef.current = false;
  };
  // 키보드: Enter/Space 는 click 으로 오고, 길게 누르기 대체 경로는 /podcast 링크(내비)
  return {
    pressing,
    handlers: {
      onClick,
      onPointerDown,
      onPointerMove,
      onPointerUp: clearPress,
      onPointerCancel,
      onLostPointerCapture: clearPress,
      onContextMenu: (e: React.SyntheticEvent) => e.preventDefault(),
    },
  };
}

export function SideNav() {
  const pathname = usePathname() ?? "/";
  const glow = useGlowOnce();
  return (
    <nav className="side-nav" aria-label="주요 메뉴">
      <Link href="/" className="sn-logo" aria-label={`${region.site.name} 홈`}>
        {/* 공식 로고(2026-10-21). 화이트판은 "2" 가 검정→파랑이라 검은 레일에서 사라져, 검은 부분만 종이색으로 바꾼
            on-dark 파생본(zone2-ondark.png, 파랑은 그대로)을 쓴다. 원본 화이트판은 zone2-white.png 로 보관 */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logos/zone2-ondark.png" alt={region.site.name} width={600} height={119} className="sn-logo-img" />
      </Link>
      <ul>
        {NAV_ITEMS.map(({ href, label, Icon }) => {
          const active = isNavActive(pathname, href);
          return (
            <li key={href}>
              <Link href={href} aria-current={active ? "page" : undefined}>
                <Icon className="sn-icon" aria-hidden />
                <span className="sn-text">
                  <strong>{label}</strong>
                  <span>{DESC[href]}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      {/* 레일 하단 — 주황 재생 원(전역 플레이어 리모컨) + 현재 회차 활자. 1px 괘선 위에 상주 */}
      <SidePlayDock glow={glow} />
      {/* 도크 아래 「지금 읽는 단락」 한 줄(15px) — 회차가 걸려 있고 회차 화면이 아닐 때만 */}
      <NowLineDock />
    </nav>
  );
}

/**
 * 데스크톱 레일 하단 재생 원 #side-play — 모바일 #fn-play 와 같은 리모컨(탭 = 재생/일시정지, 길게 = /podcast).
 * 재생 중: ▶ 대신 3막대 파형 + 둘레 진행 링(--progress). 옆 활자는 재생 중인 회차 제목·경과 시간(없으면 "오늘의 충북 듣기").
 */
function SidePlayDock({ glow }: { glow: boolean }) {
  const player = usePlayer();
  const { isPlaying, current } = player;
  const progress = progressRatio(player.currentTime, player.duration);
  const press = usePlayPress();

  const cls = ["side-play", glow ? "is-glow" : "", isPlaying ? "is-playing" : "", press.pressing ? "is-pressing" : ""]
    .filter(Boolean)
    .join(" ");
  const title = current?.title.trim() || "";

  return (
    <div className="side-play-dock">
      <button
        id="side-play"
        type="button"
        className={cls}
        style={isPlaying ? ({ "--progress": progress.toFixed(4) } as CSSProperties) : undefined}
        aria-label={`${region.podcast.seriesName} ${isPlaying ? "일시정지" : "듣기"} (길게 누르면 팟캐스트 화면)`}
        {...press.handlers}
      >
        <PlayIcon className="side-play-icon" aria-hidden />
        <span className="side-play-wave" aria-hidden><i /><i /><i /></span>
      </button>
      {/* 라이브 공지는 회차 제목에만 — 경과 시간은 매초 바뀌므로 aria-hidden(진행률은 버튼 --progress·aria-label) */}
      <span className="side-play-text">
        <strong aria-live="polite">{title || region.podcast.seriesName}</strong>
        <span aria-hidden="true">{current ? `${fmtClock(player.currentTime)} / ${fmtClock(player.duration)}` : "듣기"}</span>
      </span>
    </div>
  );
}

/** m:ss — 레일 하단 경과/전체 시간 */
function fmtClock(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = String(Math.floor(sec % 60)).padStart(2, "0");
  return `${m}:${s}`;
}

/**
 * 백색원 글로우 1회 훅 — 인트로 종료(zone2:intro-done) 또는 명시 요청(zone2:fn-glow)
 * 이벤트에 반응해 GLOW_MS 동안 .is-glow 를 붙인다. 마운트 시 자동으로 켜지지 않는다
 * (인트로 오버레이가 덮고 있는 동안 낭비되지 않도록 — 타이밍은 표지가 결정).
 */
function useGlowOnce(): boolean {
  const [glow, setGlow] = useState(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const fire = () => {
      setGlow(false);
      // 연속 요청 시 재시작: 한 프레임 뒤에 다시 켠다
      requestAnimationFrame(() => setGlow(true));
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setGlow(false), GLOW_MS);
    };
    window.addEventListener("zone2:intro-done", fire);
    window.addEventListener("zone2:fn-glow", fire);
    return () => {
      window.removeEventListener("zone2:intro-done", fire);
      window.removeEventListener("zone2:fn-glow", fire);
      if (timer) clearTimeout(timer);
    };
  }, []);
  return glow;
}

/** 중앙 주황 재생 원 — 전역 플레이어 리모컨 버튼(탭 = 재생/일시정지, 길게 = /podcast) */
function PlayButton({ glow }: { glow: boolean }) {
  const player = usePlayer();
  const { isPlaying } = player;
  const progress = progressRatio(player.currentTime, player.duration);
  const press = usePlayPress();

  const cls = ["fn-play", glow ? "is-glow" : "", isPlaying ? "is-playing" : "", press.pressing ? "is-pressing" : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      id="fn-play"
      type="button"
      className={cls}
      style={isPlaying ? ({ "--progress": progress.toFixed(4) } as CSSProperties) : undefined}
      aria-label={`${region.podcast.seriesName} ${isPlaying ? "일시정지" : "듣기"} (길게 누르면 팟캐스트 화면)`}
      {...press.handlers}
    >
      <PlayIcon className="fn-play-icon" aria-hidden />
      <span className="fn-wave" aria-hidden><i /><i /><i /></span>
    </button>
  );
}

/** iOS 홈 화면 앱(standalone) 첫 실행: safe-area 값이 첫 페인트에 0 으로 잡히는 WebKit 현상 →
 *  로드 직후 강제 재배치를 한 번 일으켜 env(safe-area-inset-bottom) 을 다시 계산하게 한다. */
function useStandaloneRelayout() {
  useEffect(() => {
    const nav = window.navigator as Navigator & { standalone?: boolean };
    const standalone = nav.standalone === true || window.matchMedia("(display-mode: standalone)").matches;
    if (!standalone) return;
    let tries = 0;
    const kick = () => {
      const root = document.documentElement;
      root.style.minHeight = "100.001vh";
      // 다음 프레임에 되돌리면 레이아웃이 두 번 일어나 inset 이 재평가된다
      window.requestAnimationFrame(() => {
        root.style.minHeight = "";
        window.dispatchEvent(new Event("resize"));
        if (++tries < 3) window.setTimeout(kick, 400);
      });
    };
    const t = window.setTimeout(kick, 50);
    return () => window.clearTimeout(t);
  }, []);
}

export function FloatingNav() {
  const pathname = usePathname() ?? "/";
  useStandaloneRelayout();
  // 4탭: 홈·공고 | [중앙 ▶ 백색원 = 팟캐] | 공론장 — 활자만, 아이콘 없음.
  const left = MOBILE_NAV_ITEMS.slice(0, 2);
  const right = MOBILE_NAV_ITEMS.slice(2);
  const glow = useGlowOnce();
  return (
    <nav className="float-nav" aria-label="빠른 이동">
      {left.map(({ href, label }) => {
        const active = isNavActive(pathname, href);
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined}>
            <span>{label}</span>
          </Link>
        );
      })}

      {/* 중앙 주황 재생 원 — 오늘의 충북(팟캐) 듣기. id="fn-play" 는 표지 핸드오프 좌표 기준. */}
      <PlayButton glow={glow} />

      {right.map(({ href, label }) => {
        const active = isNavActive(pathname, href);
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined}>
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
