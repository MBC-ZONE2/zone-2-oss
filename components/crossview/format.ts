// ============================================================================
// components/crossview/format — 크로스뷰 UI 공통 포맷 헬퍼
// ============================================================================

import type { MediaSource } from "@/types";
import { region, outletBySource } from "@/config/region";

/** 매체 라벨 (source enum → 한글 표기) */
export function sourceLabel(source: MediaSource): string {
  return outletBySource(source)?.name ?? region.outlets.micro.name;
}

/** 매체 등급 라벨 (광역/기초) */
export function tierLabel(source: MediaSource): string {
  return outletBySource(source)?.tier ?? region.outlets.micro.tier;
}

/** ISO 날짜 → "YYYY.MM.DD" (UTC 기준 표기) */
export function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}.${m}.${day}`;
}

/** 매치 점수(0~1) → 백분율 정수 문자열 */
export function formatScore(score: number | null): string {
  if (score == null) return "—";
  return `${Math.round(score * 100)}%`;
}

/** 매치 점수(0~1) → 백분율 정수(범위 밖/누락은 null) */
export function confidencePercent(score: number | null): number | null {
  if (score == null || !Number.isFinite(score)) return null;
  return Math.round(Math.min(1, Math.max(0, score)) * 100);
}
