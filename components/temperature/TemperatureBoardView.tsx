"use client";

// ============================================================================
// components/temperature/TemperatureBoardView — 온도계 화면 · 검은 세계 (FR-TH-01~04·07)
//
// 서버 초기 보드(12건)를 hydrate 한 뒤 useBoardLive 로 라이브 갱신한다(데이터 흐름 불변).
//   - 15분 카운트다운 MM:SS + Realtime 구독(먼저 오는 쪽이 갱신)
//   - 갱신 성공 시 "방금 갱신됨" 2초, 실패 시 "마지막 갱신 HH:MM" + 재시도
// 라이브 갱신은 /api/temperature?limit=12 로 초기와 같은 12건을 받아 보드를 통째로
// 교체한다(옛 배치의 6~12위가 섞여 남지 않도록 merge 하지 않는다).
//
// 화면 문법(기획안 (5)): 제호 → 좌 TOP5 5줄 · 우 점묘 온도계(뷰포트 60%, 수은은
// 1위 온도까지 1.2초 차오름) → 12사안 가는 수은주(유령 점·길게 눌러 7일 잔상) →
// 선택 사안(온도·구성 3지표·상세 링크) → 범례. 온도 전부 0 이면 순위 눈금 모드 +
// "오늘은 잠잠합니다 — 마지막으로 뜨거웠던 사안: {label} ({date}, {max}°)".
// 데스크탑(≥1100px)만: 히어로 좌 열의 TOP5 아래에 산출 안내(.tw-hero-info — 산출 시각·
// 다음 갱신·온도 5구간)를 이어 온도계 높이와 시각 비례를 맞춘다(모바일은 CSS 로 숨김).
// 스타일: app/temperature.css (.tw-board / .tw-cols-section 은 데스크탑 ≥1100px 2열 배치 훅)
// ============================================================================

import Link from "next/link";
import { useMemo, useState } from "react";
import type { TemperatureBoard, TemperatureBoardItem } from "@/types";
import { bandForTemperature } from "@/lib/temperature/formula";
import { RankingBoard } from "./RankingBoard";
import { TemperatureLegend } from "./TemperatureLegend";
import { BandList, BAND_NOTICE } from "./BandList";
import { TemperatureColumns } from "./TemperatureColumns";
import { DotThermometer } from "./DotThermometer";
import { IndexBars } from "./IndexBars";
import { RankChange } from "./RankChange";
import { useBoardLive, type BoardLiveState } from "./useBoardLive";
import { usePrefersReducedMotion } from "./hooks";
import "@/app/temperature.css";
import { region } from "@/config/region";

/** 마지막으로 뜨거웠던 사안(온도 전부 0 일 때의 문구용) */
export interface LastHot {
  label: string;
  /** ISO 시각 */
  date: string;
  max: number;
}

export interface TemperatureBoardViewProps {
  initialBoard: TemperatureBoard;
  lastHot?: LastHot | null;
}

const COLUMN_N = 12;

/** HH:MM (24h) — 마지막 갱신 시각 표시 */
function fmtClock(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime()) || d.getTime() === 0) return "—";
  return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
}

/** M월 D일 HH:MM */
function fmtStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime()) || d.getTime() === 0) return "—";
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${fmtClock(iso)}`;
}

/** M월 D일 */
function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

/** ms → MM:SS (다음 갱신까지) */
function fmtCountdown(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const mm = Math.floor(total / 60);
  const ss = total % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

/** 온도값을 0~100 으로 보정 */
function clampTemp(temperature: number): number {
  if (!Number.isFinite(temperature)) return 0;
  return Math.min(100, Math.max(0, temperature));
}

/** 현재 보드 → 12기둥 (rank 오름차순, 최대 12건). 한 배치의 행만 쓴다. */
function toColumns(items: TemperatureBoardItem[]): TemperatureBoardItem[] {
  const byRank = (a: TemperatureBoardItem, b: TemperatureBoardItem) =>
    (a.rank ?? 999) - (b.rank ?? 999);
  return [...items].sort(byRank).slice(0, COLUMN_N);
}

/** 온도계 화면(클라이언트, 라이브 갱신). */
export function TemperatureBoardView({ initialBoard, lastHot = null }: TemperatureBoardViewProps) {
  const reduced = usePrefersReducedMotion();
  const live = useBoardLive(initialBoard, COLUMN_N);
  const { board } = live;

  const columns = useMemo(() => toColumns(board.items), [board.items]);
  const empty = columns.length === 0;
  const rankMode = !empty && columns.every((it) => clampTemp(it.temperature) <= 0);
  const top1 = columns[0] ?? null;
  const top1Temp = top1 ? clampTemp(top1.temperature) : 0;
  const level = rankMode ? 0 : top1Temp / 100;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = columns.find((c) => c.id === selectedId) ?? top1;
  const selectedIndex = selected ? columns.findIndex((c) => c.id === selected.id) : -1;

  const thermoLabel = empty
    ? "점묘 온도계, 자료 없음"
    : rankMode
      ? "점묘 온도계, 순위 눈금 모드, 온도 0도"
      : `점묘 온도계, 1위 ${top1?.issue?.label ?? "사안"} ${Math.round(top1Temp)}도 ${bandForTemperature(top1Temp).label}`;

  return (
    <section className="tw tw-board" aria-label="공론 온도계">
      <header>
        <p className="tw-eyebrow">{region.site.name} · 공론 온도계</p>
        <h1 className="tw-mast">지금 뜨거운 사안</h1>
        <p className="tw-meta">
          <span>
            <time dateTime={board.computedAt}>{fmtStamp(board.computedAt)}</time> 산출
          </span>
          <RefreshIndicator state={live} />
        </p>
        {/* 범례는 div(dialog) 를 품으므로 p 가 아닌 div 로 감싼다 */}
        <div className="tw-note" style={{ marginTop: 10 }}>
          댓글·공론장 여론을 분석해 사안별 열기를 0~100°로 환산했습니다.{" "}
          <TemperatureLegend />
        </div>
      </header>

      {rankMode && (
        <p className="tw-calm" role="status">
          오늘은 잠잠합니다
          {lastHot ? (
            <>
              {" "}
              — 마지막으로 뜨거웠던 사안: <em>{lastHot.label}</em> ({fmtDate(lastHot.date)},{" "}
              {Math.round(lastHot.max)}°)
            </>
          ) : null}
        </p>
      )}

      {/* ── 히어로: 좌 TOP5 · 우 점묘 온도계 ─────────────────────────── */}
      <div className="tw-hero">
        {empty ? (
          <p className="tw-empty">온도 데이터가 아직 없습니다.</p>
        ) : (
          <RankingBoard items={columns} reduced={reduced} rankMode={rankMode} />
        )}
        <div className="tw-thermo">
          <span className={rankMode ? "tw-thermo-cap is-rank" : "tw-thermo-cap"} aria-hidden>
            {rankMode ? "순위로 보기" : empty ? "—" : `${Math.round(top1Temp)}°`}
          </span>
          <DotThermometer level={level} ticks={rankMode ? 12 : 8} label={thermoLabel} />
        </div>
        {/* 데스크탑 전용 — 좌 열 아래 산출 안내(온도계 높이만큼 남는 빈 면을 채운다) */}
        <HeroInfo state={live} />
      </div>

      {/* ── 12사안 온도판 ────────────────────────────────────────────── */}
      {!empty && (
        <section className="tw-section tw-cols-section" aria-labelledby="tw-cols-title">
          <div className="tw-section-head">
            <h2 id="tw-cols-title" className="tw-h2">
              {rankMode ? "12사안 순위" : "12사안 온도판"}
            </h2>
            <p className="tw-meta">{columns.length}사안 · 지난 배치 자리는 회색 점</p>
          </div>
          <TemperatureColumns
            items={columns}
            rankMode={rankMode}
            reduced={reduced}
            selectedId={selected?.id ?? null}
            onSelect={setSelectedId}
          />

          {selected && (
            <FocusPanel item={selected} displayRank={selected.rank ?? selectedIndex + 1} rankMode={rankMode} />
          )}
        </section>
      )}
    </section>
  );
}

/** 선택된 사안 — 이름·온도·변동·구성 3지표·상세 링크 */
function FocusPanel({
  item,
  displayRank,
  rankMode,
}: {
  item: TemperatureBoardItem;
  displayRank: number;
  rankMode: boolean;
}) {
  const t = clampTemp(item.temperature);
  const band = bandForTemperature(t);
  const label = item.issue?.label ?? "이름 없는 사안";
  // 라이브 영역은 3지표 블록만 — 순위·이름·온도는 기둥 slider 의 aria-valuetext 가
  // 이미 읽어 주므로 여기서 다시 낭독하지 않는다(이중 낭독 방지). 시각 배치는 그대로.
  return (
    <div className="tw-focus">
      <div className="tw-focus-head">
        <h3 className="tw-h2">
          <span className="tw-dim" style={{ marginRight: 8 }}>
            {displayRank}위
          </span>
          {label}
        </h3>
        <RankChange rank={item.rank} prevRank={item.prevRank} />
      </div>
      <div className="tw-focus-head">
        {rankMode ? (
          <span className="tw-p">온도 0° · 순위로 보기</span>
        ) : (
          <>
            <span className="tw-num">
              {Math.round(t)}
              <small>°</small>
            </span>
            <span className="tw-p">{band.label}</span>
          </>
        )}
        {item.issueId && (
          <Link href={`/temperature/${item.issueId}`} className="tw-link" style={{ marginLeft: "auto" }}>
            사안 자세히 →
          </Link>
        )}
      </div>
      <div aria-live="polite" aria-atomic="true">
        <IndexBars frequency={item.frequency} sentimentVar={item.sentimentVar} topicConc={item.topicConc} />
        {item.issueId && (
          // 화면에는 안 보이는 링크 안내(링크 자체는 위 온도 줄에 있음)
          <span className="sr-only">사안 자세히 링크로 상세를 볼 수 있습니다. Enter 키로도 이동합니다.</span>
        )}
      </div>
    </div>
  );
}

/** 히어로 좌 열 아래 산출 안내 — 산출 시각·다음 갱신·간격 + 온도 5구간(데스크탑만 보임) */
function HeroInfo({ state }: { state: BoardLiveState }) {
  const { board, remainingMs, error, live } = state;
  // 다음 갱신 문구 — RefreshIndicator 와 같은 상태를 활자로만 요약(버튼은 위에 하나면 충분)
  const next = error
    ? "갱신 실패 · 재시도 대기"
    : remainingMs != null
      ? fmtCountdown(remainingMs)
      : live
        ? "실시간"
        : "연결 중";
  return (
    <aside className="tw-hero-info" aria-label="산출 안내">
      <dl className="tw-hero-dl">
        <div>
          <dt>산출 시각</dt>
          <dd>
            <time dateTime={board.computedAt}>{fmtStamp(board.computedAt)}</time>
          </dd>
        </div>
        <div>
          <dt>다음 갱신</dt>
          <dd>{next}</dd>
        </div>
        <div>
          <dt>산출 간격</dt>
          <dd>15분 · 최근 7일 댓글·공론장</dd>
        </div>
      </dl>
      <p className="tw-eyebrow">온도 구간</p>
      <BandList />
      <p className="tw-note">{BAND_NOTICE}</p>
    </aside>
  );
}

/** 갱신 상태 표시 — 카운트다운 / 방금 갱신됨 / 실패+재시도. 활자만. */
function RefreshIndicator({ state }: { state: BoardLiveState }) {
  const { board, remainingMs, justUpdated, error, refreshing, live, retryNow } = state;

  if (error) {
    return (
      <span role="status" aria-live="polite" className="tw-status">
        <span>마지막 갱신 {fmtClock(board.computedAt)}</span>
        <button type="button" onClick={retryNow} disabled={refreshing}>
          재시도
        </button>
      </span>
    );
  }

  if (justUpdated) {
    return (
      <span role="status" aria-live="polite" className="tw-status is-fresh">
        방금 갱신됨
      </span>
    );
  }

  return (
    <span className={live ? "tw-status is-live" : "tw-status"}>
      <span className="tw-status-dot" aria-hidden />
      {remainingMs != null ? (
        <span>다음 갱신 {fmtCountdown(remainingMs)}</span>
      ) : (
        <span>{live ? "실시간" : "연결 중"}</span>
      )}
    </span>
  );
}
