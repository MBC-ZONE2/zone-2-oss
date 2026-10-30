"use client";

// ============================================================================
// components/temperature/TemperatureColumns — 12사안 가는 수은주 12개
//
// 기획안 (5) 온도계: 2px 폭 기둥 12개, 높이 = 온도(잠잠은 회색). prev_rank 자리에는
// 회색 유령 점. 기둥을 길게 누르면(pointerdown 600ms) 7일 추이가 반투명 잔상 기둥으로
// 옆에 펼쳐진다(/api/temperature/[issueId]?limit=672&fields=trend → 날짜별 최고 온도 7일,
// 감정 분포는 생략된 축약 응답).
// 온도가 전부 0 이면 「순위 눈금 모드」: 높이 = 순위(12등분), 눈금 12칸.
//
// 접근성 — 12기둥은 세로 range 시맨틱(role="slider" aria-orientation="vertical",
// aria-readonly, aria-valuetext). ←/↑ 앞 순위, →/↓ 뒤 순위, Home/End, Enter = 상세,
// Space = 7일 잔상 고정 토글, Esc = 닫기. 탭 타깃은 셀 전체(높이 180px).
// 등장 애니메이션 없음. 움직이는 것은 수은(차오름 900ms)뿐. 스타일: app/temperature.css
// ============================================================================

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { bandForTemperature } from "@/lib/temperature/formula";
import type { TemperatureBoardItem, TemperaturePoint } from "@/types";

const LONG_PRESS_MS = 600;
const DAYS = 7;
const TREND_LIMIT = 96 * DAYS; // 15분 × 96 = 하루

/** 하루 최고 온도 (자료 없는 날은 null) */
interface DayBar {
  key: string;
  label: string;
  max: number | null;
}

type GhostState = "loading" | "error" | DayBar[];

export interface TemperatureColumnsProps {
  /** 표시 순서(순위) 대로 정렬된 최대 12건 */
  items: TemperatureBoardItem[];
  /** 온도 전부 0 → 순위 눈금 모드 */
  rankMode: boolean;
  /** 모션 최소화 */
  reduced: boolean;
  /** 선택된 항목 id(점수 row id) */
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/** 온도값을 0~100 으로 보정 */
function clampTemp(temperature: number): number {
  if (!Number.isFinite(temperature)) return 0;
  return Math.min(100, Math.max(0, temperature));
}

/** 로컬 날짜 키 yyyy-mm-dd */
function dayKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 추이 포인트 → 최근 7일(오늘 포함) 날짜별 최고 온도 */
function bucketDays(points: TemperaturePoint[]): DayBar[] {
  const byDay = new Map<string, number>();
  for (const p of points) {
    const d = new Date(p.computedAt);
    if (Number.isNaN(d.getTime())) continue;
    const k = dayKey(d);
    byDay.set(k, Math.max(byDay.get(k) ?? 0, clampTemp(p.temperature)));
  }
  const out: DayBar[] = [];
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const k = dayKey(d);
    out.push({
      key: k,
      label: `${d.getMonth() + 1}/${d.getDate()}`,
      max: byDay.has(k) ? (byDay.get(k) as number) : null,
    });
  }
  return out;
}

/** /api/temperature/[issueId] 봉투 → 추이 배열 (실패 시 null) */
function readTrend(json: unknown): TemperaturePoint[] | null {
  if (typeof json !== "object" || json === null) return null;
  const data = (json as { data?: unknown }).data;
  if (typeof data !== "object" || data === null) return null;
  const trend = (data as { trend?: unknown }).trend;
  return Array.isArray(trend) ? (trend as TemperaturePoint[]) : null;
}

/** 12사안 온도판. */
export function TemperatureColumns({
  items,
  rankMode,
  reduced,
  selectedId,
  onSelect,
}: TemperatureColumnsProps) {
  const router = useRouter();
  const n = Math.max(12, items.length);
  const [filled, setFilled] = useState(reduced);
  const [ghostId, setGhostId] = useState<string | null>(null);
  const [ghosts, setGhosts] = useState<Record<string, GhostState>>({});
  const stickyRef = useRef(false); // 키보드(Space)로 고정한 잔상인가
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressedRef = useRef(false); // 길게 눌림이 발동해 click 을 무시해야 하는가
  const cellRefs = useRef<(HTMLDivElement | null)[]>([]);

  // 차오름 — 마운트 다음 프레임에 높이를 켠다(reduced 는 즉시)
  useEffect(() => {
    if (reduced) {
      setFilled(true);
      return undefined;
    }
    const raf = requestAnimationFrame(() => setFilled(true));
    return () => cancelAnimationFrame(raf);
  }, [reduced]);

  useEffect(
    () => () => {
      if (pressTimer.current) clearTimeout(pressTimer.current);
    },
    [],
  );

  /** 7일 추이 로드(캐시) */
  const loadGhost = useCallback(
    (issueId: string) => {
      if (ghosts[issueId] && ghosts[issueId] !== "error") return;
      setGhosts((g) => ({ ...g, [issueId]: "loading" }));
      // fields=trend: 감정 분포 스캔을 건너뛰는 축약 모드. 브라우저 HTTP 캐시(라우트의
      // Cache-Control max-age=300)를 살리려고 no-store 를 쓰지 않는다.
      fetch(`/api/temperature/${issueId}?limit=${TREND_LIMIT}&fields=trend`, {
        headers: { accept: "application/json" },
      })
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
        .then((json) => {
          const trend = readTrend(json);
          if (!trend) throw new Error("invalid_payload");
          setGhosts((g) => ({ ...g, [issueId]: bucketDays(trend) }));
        })
        .catch(() => setGhosts((g) => ({ ...g, [issueId]: "error" })));
    },
    [ghosts],
  );

  const openGhost = useCallback(
    (item: TemperatureBoardItem, sticky: boolean) => {
      stickyRef.current = sticky;
      setGhostId(item.id);
      if (item.issueId) loadGhost(item.issueId);
    },
    [loadGhost],
  );

  const closeGhost = useCallback(() => {
    stickyRef.current = false;
    setGhostId(null);
  }, []);

  const clearPress = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

  const onPointerDown = (item: TemperatureBoardItem) => (e: PointerEvent<HTMLDivElement>) => {
    if (!e.isPrimary) return;
    pressedRef.current = false;
    clearPress();
    pressTimer.current = setTimeout(() => {
      pressTimer.current = null;
      pressedRef.current = true;
      onSelect(item.id);
      openGhost(item, false);
    }, LONG_PRESS_MS);
  };

  const onPointerEnd = () => {
    clearPress();
    // 손을 떼면 잔상을 접는다(키보드로 고정한 잔상은 유지)
    if (!stickyRef.current && pressedRef.current) closeGhost();
  };

  const onClick = (item: TemperatureBoardItem) => () => {
    if (pressedRef.current) {
      pressedRef.current = false;
      return;
    }
    onSelect(item.id);
  };

  const focusIndex = (i: number) => {
    const el = cellRefs.current[i];
    if (el) el.focus();
  };

  const onKeyDown = (item: TemperatureBoardItem, i: number) => (e: KeyboardEvent<HTMLDivElement>) => {
    const last = items.length - 1;
    switch (e.key) {
      case "ArrowLeft":
      case "ArrowUp":
        e.preventDefault();
        focusIndex(Math.max(0, i - 1));
        break;
      case "ArrowRight":
      case "ArrowDown":
        e.preventDefault();
        focusIndex(Math.min(last, i + 1));
        break;
      case "Home":
        e.preventDefault();
        focusIndex(0);
        break;
      case "End":
        e.preventDefault();
        focusIndex(last);
        break;
      case "Enter":
        if (item.issueId) {
          e.preventDefault();
          router.push(`/temperature/${item.issueId}`);
        }
        break;
      case " ":
        e.preventDefault();
        if (ghostId === item.id) closeGhost();
        else openGhost(item, true);
        break;
      case "Escape":
        if (ghostId) {
          e.preventDefault();
          closeGhost();
        }
        break;
      default:
        break;
    }
  };

  /** 기둥 높이(%) — 온도 또는 순위 눈금 */
  const heightOf = (item: TemperatureBoardItem, i: number): number => {
    if (rankMode) {
      const rank = item.rank ?? i + 1;
      return Math.max(0, Math.min(100, ((n + 1 - rank) / n) * 100));
    }
    return clampTemp(item.temperature);
  };

  const rovingIndex = Math.max(
    0,
    items.findIndex((it) => it.id === selectedId),
  );

  return (
    <div className="tw-cols">
      <div
        className={rankMode ? "tw-cols-area is-rank" : "tw-cols-area"}
        role="group"
        aria-label={rankMode ? "12사안 순위 눈금" : "12사안 온도 기둥"}
      >
        {items.map((item, i) => {
          const rank = item.rank ?? i + 1;
          const label = item.issue?.label ?? "이름 없는 사안";
          const t = Math.round(clampTemp(item.temperature));
          const band = bandForTemperature(t);
          const h = heightOf(item, i);
          const calm = !rankMode && t < 20;
          const isSel = item.id === selectedId;
          const showGhost = ghostId === item.id;
          const ghost = item.issueId ? ghosts[item.issueId] : undefined;
          const valueText = rankMode
            ? `${rank}위 ${label}, 온도 0도, 순위 눈금`
            : `${rank}위 ${label}, 공론 온도 ${t}도 ${band.label}` +
              (item.prevRank != null ? `, 지난 순위 ${item.prevRank}위` : ", 신규 진입");
          const cls = [
            "tw-col",
            filled ? "is-filled" : "",
            calm ? "is-calm" : "",
            isSel ? "is-selected" : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <div
              key={item.id}
              ref={(el) => {
                cellRefs.current[i] = el;
              }}
              className={cls}
              style={{ "--h": `${h}%` } as CSSProperties}
              role="slider"
              tabIndex={i === rovingIndex ? 0 : -1}
              aria-orientation="vertical"
              aria-readonly="true"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={rankMode ? Math.round(h) : t}
              aria-valuetext={valueText}
              aria-label={`${rank}위 ${label}`}
              onPointerDown={onPointerDown(item)}
              onPointerUp={onPointerEnd}
              onPointerCancel={onPointerEnd}
              onPointerLeave={onPointerEnd}
              onClick={onClick(item)}
              onContextMenu={(e) => e.preventDefault()}
              onKeyDown={onKeyDown(item, i)}
              onFocus={() => onSelect(item.id)}
            >
              <span className="tw-col-bar" aria-hidden />
              {showGhost && (
                <GhostColumns state={ghost} rankMode={rankMode} />
              )}
            </div>
          );
        })}

        {/* prev_rank 자리의 회색 유령 점 — 지난 배치에서 이 사안이 있던 자리 */}
        {items.map((item, i) => {
          const rank = item.rank ?? i + 1;
          const prev = item.prevRank;
          if (prev == null || prev === rank || prev < 1 || prev > n) return null;
          const h = heightOf(item, i);
          return (
            <span
              key={`ghost-${item.id}`}
              className="tw-ghost-dot"
              aria-hidden
              style={{ left: `${((prev - 0.5) / n) * 100}%`, bottom: `${h}%` }}
            />
          );
        })}
      </div>

      <ol className="tw-cols-rank" aria-hidden>
        {items.map((item, i) => (
          <li key={item.id} className={item.id === selectedId ? "is-selected" : ""}>
            {item.rank ?? i + 1}
          </li>
        ))}
      </ol>
      <p className="tw-cols-hint">
        {rankMode ? "순위로 보기 — " : ""}
        기둥을 누르면 사안이 아래에, 길게 누르면 7일 추이가 옆에 펼쳐집니다.
      </p>
    </div>
  );
}

/** 길게 눌러 펼친 7일 잔상 기둥(반투명 수은). 로딩은 회색 바닥 점, 실패는 "—". */
function GhostColumns({ state, rankMode }: { state: GhostState | undefined; rankMode: boolean }) {
  if (!state || state === "loading") {
    return (
      <span className="tw-col-ghosts is-loading" aria-hidden>
        {Array.from({ length: DAYS }).map((_, i) => (
          <i key={i} />
        ))}
      </span>
    );
  }
  if (state === "error") {
    return (
      <span className="tw-col-ghost-cap" aria-hidden>
        7일 추이 —
      </span>
    );
  }
  const maxDay = state.reduce<DayBar | null>(
    (m, d) => (d.max != null && (m == null || d.max > (m.max ?? 0)) ? d : m),
    null,
  );
  return (
    <>
      <span className="tw-col-ghost-cap" aria-hidden>
        7일{" "}
        {maxDay && maxDay.max != null && !rankMode ? `최고 ${Math.round(maxDay.max)}° (${maxDay.label})` : ""}
      </span>
      <span
        className="tw-col-ghosts"
        role="img"
        aria-label={`최근 7일 최고 온도: ${state
          .map((d) => `${d.label} ${d.max == null ? "없음" : `${Math.round(d.max)}도`}`)
          .join(", ")}`}
      >
        {state.map((d) => (
          <i
            key={d.key}
            className={d.max == null ? "is-empty" : ""}
            style={{ "--h": `${d.max ?? 0}%` } as CSSProperties}
          />
        ))}
      </span>
    </>
  );
}
