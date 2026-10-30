"use client";

// ============================================================================
// components/temperature/RankingBoard — TOP5 다섯 줄 (FR-TH-01~03·07)
//
// 인트로 문장 레이아웃을 물려받는다: 좌측 기준선(20/76), 25px 700, 줄 간격 ≈37px,
// 강조줄(1위)만 #f4f5f7 나머지 #919191. 각 줄 = 순위·사안명 → 아래 15px 메타
// (온도°·밴드·순위 변동). 1위 온도는 대형 숫자로 수은과 같은 박자(1.2초)로 차오른다.
// 행 전체가 상세 링크(issueId 없으면 활자만). 게이지·배지 면 없음.
// 순위 눈금 모드(온도 전부 0)에서는 온도 대신 "순위 n위" 활자.
// ============================================================================

import Link from "next/link";
import { bandForTemperature } from "@/lib/temperature/formula";
import type { TemperatureBoardItem } from "@/types";
import { RankChange } from "./RankChange";
import { useRise } from "./hooks";

export interface RankingBoardProps {
  items: TemperatureBoardItem[];
  /** 모션 최소화 여부 (1위 숫자 차오름 생략) */
  reduced: boolean;
  /** 온도 전부 0 → 순위 눈금 모드 */
  rankMode?: boolean;
}

/** 온도값을 0~100 으로 보정 */
function clampTemp(temperature: number): number {
  if (!Number.isFinite(temperature)) return 0;
  return Math.min(100, Math.max(0, temperature));
}

/** TOP5 다섯 줄. */
export function RankingBoard({ items, reduced, rankMode = false }: RankingBoardProps) {
  return (
    <ol className="tw-lines" aria-label="TOP 5 사안">
      {items.slice(0, 5).map((item, i) => (
        <TopLine
          key={item.id}
          item={item}
          displayRank={item.rank ?? i + 1}
          top={i === 0}
          reduced={reduced}
          rankMode={rankMode}
        />
      ))}
    </ol>
  );
}

/** 한 줄 — 순위·사안명 + 메타(온도·밴드·변동). 1위는 대형 숫자 차오름. */
function TopLine({
  item,
  displayRank,
  top,
  reduced,
  rankMode,
}: {
  item: TemperatureBoardItem;
  displayRank: number;
  top: boolean;
  reduced: boolean;
  rankMode: boolean;
}) {
  const target = clampTemp(item.temperature);
  const rise = useRise(target, reduced, 1200);
  const shown = Math.round(top ? rise : target);
  const band = bandForTemperature(target);
  const label = item.issue?.label ?? "이슈 라벨 준비 중";
  const roundV = Math.round(target);
  const issueId = item.issueId;

  const body = (
    <>
      <span className="tw-line-txt">
        <span className="tw-line-rank" aria-hidden>
          {displayRank}
        </span>
        <span className="tw-line-label">{label}</span>
      </span>
      <span className="tw-line-sub">
        {rankMode ? (
          <span>순위 {displayRank}위</span>
        ) : (
          <>
            <span className="tw-line-temp" aria-hidden>
              {shown}
              <small>°</small>
            </span>
            <span>{band.label}</span>
          </>
        )}
        <RankChange rank={item.rank} prevRank={item.prevRank} reduced={reduced} />
      </span>
    </>
  );

  const cls = top ? "tw-line is-top" : "tw-line";
  if (!issueId) {
    return (
      <li className={cls} aria-label={`${displayRank}위 ${label}, 공론 온도 ${roundV}도 ${band.label}, 상세 준비 중`}>
        {body}
      </li>
    );
  }
  return (
    <li className={cls}>
      <Link
        href={`/temperature/${issueId}`}
        aria-label={`${displayRank}위 ${label}, 공론 온도 ${roundV}도 ${band.label}, 상세 보기`}
      >
        {body}
      </Link>
    </li>
  );
}
