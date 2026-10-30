// ============================================================================
// components/crossview/crossview-card — 목록 괘선 행 (FR-CV-04)
//
// 「일점 지면」 크로스뷰 목록 한 행(≥96px):
//   광역 제목(⋯ 마커) · 기초 제목(▬ 마커) — 두 제목 같은 굵기 700, 사이 세로 괘선 없음.
//   매체 라벨 앞에 <MediaIcon>(송신탑/종이신문) — 마커는 헤드라인 앞 그대로.
//   폰(<640)은 상하 스택, ≥640 은 좌우 두 열(열 사이는 빈 종이뿐).
//   Figma #12(2026-09-11): 항목 옆 세로 테두리(유사도 점 괘선)와 "보도 유사도 N%" 문구는
//   지웠다 — 메타는 날짜 · 온도만. 온도(tempForItem) 미매칭이면 온도 자리를 비운다.
// 사진은 목록에 두지 않는다 — 헤드라인 활자가 목록이다.
// <li> 를 반환하므로 <ol class="cvp-rows"> 안에서 쓴다. 스타일: app/crossview.css
// ⚠️ 데이터 조작 금지 — 온도는 실 산출 보드(temperature)와 키워드 매칭된 것만 표기.
// ============================================================================

import Link from "next/link";
import type { CrossviewPairWithArticles } from "@/lib/matching";
import type { TemperatureBoardItem } from "@/types";
import { tempForItem } from "@/lib/reels/deck";
import { cn } from "@/lib/utils";
import { MediaIcon } from "@/components/ui/media-icon";
import { formatDate } from "./format";
import { Marker, OUTLET, TIER } from "./marker";
import "@/app/crossview.css";

/** 한쪽 열 — 마커 + 매체 라벨 + 제목 */
function Column({
  side,
  title,
}: {
  side: "macro" | "micro";
  title: string | null;
}) {
  return (
    <span className={`cvp-col ${side}`}>
      <span className="cvp-col-head">
        <Marker side={side} />
        <span className="cvp-col-outlet">
          {/* 매체 아이콘: 광역=방송(송신탑), 기초=지면(종이신문) — 장식, 글자색 */}
          <MediaIcon kind={side === "macro" ? "broadcast" : "paper"} className="cvp-mi" />
          <span className="cvp-sr">{TIER[side]} · </span>
          {OUTLET[side]}
        </span>
      </span>
      <span className={cn("cvp-row-title", !title && "empty")}>
        {title ?? "대응 보도 없음"}
      </span>
    </span>
  );
}

/** 목록 괘선 행 — 클릭 시 상세(/crossview/[id])로 이동 */
export function CrossviewCard({
  pair,
  temperature = [],
  className,
}: {
  pair: CrossviewPairWithArticles;
  /** 공론 온도 보드(실 산출). 비어 있으면 전 행 미매칭(점선) */
  temperature?: TemperatureBoardItem[];
  className?: string;
}) {
  const macroTitle = pair.macro?.title?.trim() || null;
  const microTitle = pair.micro?.title?.trim() || null;
  const published = formatDate(pair.createdAt);

  // 유사도(pair.similarity)는 화면에 쓰지 않는다 — 표기·시각화 모두 제거(Figma #12).
  const matched = temperature.length ? tempForItem(pair, temperature) : null;
  const temp = matched ? Math.round(matched.row.temperature) : null;

  return (
    <li className={cn("cvp-row", className)} data-temp={matched ? "matched" : "none"}>
      <Link href={`/crossview/${pair.id}`} className="cvp-row-link">
        <Column side="macro" title={macroTitle} />
        <Column side="micro" title={microTitle} />
      </Link>

      <p className="cvp-row-meta">
        {published ? <time dateTime={pair.createdAt}>{published}</time> : null}
        {matched && temp != null ? (
          <span className="temp">
            {temp}° {matched.band.label}
            <span className="cvp-sr"> — 공론 온도</span>
          </span>
        ) : null}
      </p>
    </li>
  );
}

/** 이름 별칭 — 이 컴포넌트는 카드가 아니라 괘선 행이다 */
export { CrossviewCard as CrossviewRow };
