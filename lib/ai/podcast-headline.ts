// ============================================================================
// lib/ai/podcast-headline — 팟캐 회차의 내용 요약 헤드라인 생성(codex)
//
// Figma 코멘트 #4(디자인 검토, 2026-09-11): 목록 제목은 내용 축약이어야 한다.
// episodes.title 은 "오늘의 충북 9월 8일"(날짜)라 회차 식별용으로 두고, 대본에서
// 편집 헤드라인 한 줄을 지어 podcast_episodes.headline 에 저장한다(마이그레이션 0020).
// 도면의 예: "52년 만의 그린벨트 해제, 옥천은 무엇을 얻고 무엇을 내주나",
//            "무궁화 46회 시대 — 오정역 15분이 바꾸는 하루", "3만 인구 회복, 숫자 뒤의 사람들".
//
// 규칙: 대본에 있는 사실만, 담백하게, 40자 이내. 실패하면 null — 화면은
// lib/podcast/script.episodeHeadline(대본 휴리스틱)으로 폴백한다.
// 호출: 회차 생성(lib/podcast/generate) + 빈 행 보충(backfillEpisodeHeadlines, 크론·스크립트).
// ============================================================================

import { z } from "zod";
import { region } from "@/config/region";
import { generateJsonViaCli, isLocalCliMode } from "./local-cli";
import { createServiceClient } from "@/lib/supabase/server";

/** 헤드라인 길이 상한(자) — 목록 17px 두 줄, 데스크탑 28px 한 줄 안에 든다 */
export const PODCAST_HEADLINE_MAX = 40;
/** 이보다 짧으면 사안이 안 읽힌다("인구와 체육") — 다시 요청 */
const HEADLINE_MIN = 10;

/** 날짜·프로그램명은 헤드라인이 아니다(규칙 5) — zod 에서 걸러야 CLI 공통 재시도가 교정한다 */
const SERIES_PATTERN = region.podcast.seriesName
  .split(/\s+/)
  .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  .join("\\s*");
const FORBIDDEN_RE = new RegExp(`${SERIES_PATTERN}|오디오\\s*브리핑|\\d+월\\s*\\d+일`);

const HeadlineSchema = z.object({
  headline: z
    .string()
    .transform((v) => v.replace(/["“”'‘’]/g, "").replace(/\s+/g, " ").trim())
    .pipe(
      z
        .string()
        .min(HEADLINE_MIN, `${HEADLINE_MIN}자 이상`)
        .max(PODCAST_HEADLINE_MAX, `${PODCAST_HEADLINE_MAX}자 이내`)
        .refine((v) => !FORBIDDEN_RE.test(v), "날짜·프로그램 이름은 넣지 않는다")
        .refine((v) => !/[.。]$/.test(v), "마침표 없이"),
    ),
});

const SYSTEM = [
  "너는 한국 지역 라디오 뉴스의 헤드라인 에디터다. 아나운서 대본 한 편을 읽고, 청취자가 목록에서 " +
    "이 회차를 고를 만한 편집 헤드라인 한 줄을 짓는다.",
  "규칙:",
  `(1) ${HEADLINE_MIN}자 이상 ${PODCAST_HEADLINE_MAX}자 이내. 20~34자를 목표로 한다.`,
  "(2) 대본에 있는 사실·숫자·지명만 쓴다. 대본에 없는 것을 지어내지 않는다.",
  "(3) 가장 비중 있는 사안 하나를 중심에 두고, 둘째 사안은 쉼표나 줄표(—)로 이어 붙일 수 있다.",
  "(4) 담백하게. 과장·낚시·감탄·물음표 남발 금지. '충격'·'논란의'·'명암'·'…에 대한 고찰' 같은 상투어 금지.",
  `(5) 날짜('9월 8일')나 '${region.podcast.seriesName}'·'오디오 브리핑' 같은 프로그램 이름은 넣지 않는다.`,
  "(6) 마침표·따옴표 없이 헤드라인만. 명사구로 끝내거나 짧은 서술로 끝낸다.",
  `(7) 대본에 「${region.podcast.localCorner}」 코너의 ${region.place.name} 소식이 있으면, 비중이 비슷할 때는 ${region.place.name} 사안을 우선하거나 둘째 사안으로 이어 붙인다(억지로 넣지는 않는다).`,
  `예시 어조: '52년 만의 그린벨트 해제, ${region.place.name}은 무엇을 얻고 무엇을 내주나' / ` +
    "'무궁화 46회 시대 — 오정역 15분이 바꾸는 하루' / '3만 인구 회복, 숫자 뒤의 사람들'.",
].join("\n");

/** 대본 앞부분만 보낸다 — 헤드라인·사안 도입은 앞쪽에 있고, 전체를 보내면 느리기만 하다 */
const SCRIPT_CLIP = 2600;

/** 스키마 뒤 마지막 확인 — 날짜 제목을 그대로 돌려준 경우만 남는다 */
function acceptable(headline: string, dateTitle: string): boolean {
  return headline.length >= HEADLINE_MIN && headline !== dateTitle.trim();
}

/**
 * 대본 → 편집 헤드라인 한 줄. codex 미가동·실패·규칙 위반이면 null.
 * @param script 대본 전문(윤문·금칙어 마스킹 뒤)
 * @param dateTitle 날짜 제목("오늘의 충북 9월 8일") — 그대로 돌려주면 실패로 본다
 */
export async function generateEpisodeHeadline(
  script: string | null | undefined,
  dateTitle = "",
  opts: {
    /** 이웃 회차가 이미 쓴 헤드라인 — 대본에 다른 사안이 있으면 그쪽으로 짓게 한다(표현만 바꾸는 건 금지) */
    avoid?: string[];
  } = {},
): Promise<string | null> {
  const body = String(script ?? "").trim();
  if (!body || !isLocalCliMode()) return null;

  const avoid = (opts.avoid ?? []).map((v) => v.trim()).filter(Boolean);
  const prompt = [
    "다음은 오늘 방송된 지역 뉴스 대본이다. 이 회차의 헤드라인 한 줄을 지어라.",
    ...(avoid.length > 0
      ? [
          "",
          "이웃 회차가 이미 쓴 헤드라인(같은 사안이 며칠째 이어질 때 목록에서 회차를 구별하기 위한 참고):",
          ...avoid.map((v) => `- ${v}`),
          "대본에 위와 **다른 사안**이 있으면 그 사안으로 헤드라인을 지어라. 다른 사안이 정말 없으면 같은 사안으로 " +
            "짓되, 위 문장의 낱말만 바꿔 흉내 내지 말고 대본이 새로 전한 사실(진행 단계·수치·반응)을 담아라.",
        ]
      : []),
    "",
    "=== 대본 ===",
    body.slice(0, SCRIPT_CLIP),
    body.length > SCRIPT_CLIP ? "(이하 생략)" : "",
    "=== 끝 ===",
  ].join("\n");

  const result = await generateJsonViaCli(HeadlineSchema, {
    system: SYSTEM,
    prompt,
    format: '{"headline": "<헤드라인 한 줄>"}',
    label: "podcast-headline",
  });
  const headline = result?.headline ?? "";
  if (!acceptable(headline, dateTitle)) {
    if (headline) console.warn(`[podcast-headline] 규칙 위반으로 버림: "${headline}"`);
    return null;
  }
  return headline;
}

interface HeadlineEpisodeRow {
  id: string;
  title: string;
  script: string | null;
  status: string;
  scheduled_for?: string | null;
}

/**
 * 기간 안 회차의 헤드라인을 **다시** 짓는다(이미 있는 값도 덮는다).
 * 회차를 날짜순으로 돌며 이 실행에서 이미 나온 헤드라인을 avoid 로 넘겨, 같은 기사가 며칠째
 * 이어지는 구간(예: 2026-07 폴백 대본)에서 대본에 다른 사안이 있으면 그쪽으로 갈라 짓는다.
 * 다른 사안이 없는 회차는 같은 사안으로 남는다 — 억지 변주는 하지 않는다.
 * @returns {generated, failed, targeted, duplicates} duplicates = 실행 뒤에도 남은 중복 헤드라인 수
 */
export async function regenerateEpisodeHeadlines(
  range: { from: string; to: string },
  opts: { dryRun?: boolean; log?: (line: string) => void } = {},
): Promise<{ generated: number; failed: number; targeted: number; duplicates: number }> {
  const log = opts.log ?? (() => {});
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("podcast_episodes")
    .select("id, title, script, status, scheduled_for")
    .neq("status", "failed")
    .not("script", "is", null)
    .gte("scheduled_for", range.from)
    .lte("scheduled_for", range.to)
    .order("scheduled_for", { ascending: true });
  if (error) throw new Error(`회차 조회 실패: ${error.message}`);

  const rows = (data ?? []) as HeadlineEpisodeRow[];
  const used: string[] = [];
  let generated = 0;
  let failed = 0;
  for (const ep of rows) {
    let headline: string | null = null;
    try {
      headline = await generateEpisodeHeadline(ep.script, ep.title, { avoid: used });
    } catch (e) {
      console.error(`[podcast-headline] ${ep.id} ${ep.title} 예외:`, e instanceof Error ? e.message : e);
    }
    if (!headline) {
      failed += 1;
      log(`${ep.title} (${ep.status}) → (실패 — 기존 값 유지)`);
      continue;
    }
    generated += 1;
    log(`${ep.title} (${ep.status}) → ${headline}${used.includes(headline) ? "  [중복]" : ""}`);
    if (!used.includes(headline)) used.push(headline);
    if (opts.dryRun) continue;
    const { error: upErr } = await supabase
      .from("podcast_episodes")
      .update({ headline })
      .eq("id", ep.id);
    if (upErr) console.error(`[podcast-headline] ${ep.id} 저장 실패:`, upErr.message);
  }
  return { generated, failed, targeted: rows.length, duplicates: generated - used.length };
}

/**
 * headline 이 비어 있는 회차(failed 제외)에 헤드라인을 지어 채운다.
 * 회차 생성 때 codex 가 실패했거나(null) 컬럼 도입 전 회차가 대상.
 *
 * 실패한 행은 headline='' 로 표시한다 — null 로 두면 같은 행이 매시 다시 뽑혀 뒤의 null 행이
 * 영영 차례를 못 받는다(리뷰 지적). '' 는 화면에서 null 과 같이 휴리스틱으로 폴백하고,
 * 다시 시도하려면 retryFailed 로 '' 행까지 대상에 넣는다(스크립트 --retry-failed).
 * 갱신은 "아직 비어 있을 때만" — 그 사이 다른 실행·관리자 편집이 채웠으면 덮지 않는다.
 * @returns {generated, failed, targeted}
 */
export async function backfillEpisodeHeadlines(
  limit = 10,
  opts: { dryRun?: boolean; retryFailed?: boolean; log?: (line: string) => void } = {},
): Promise<{ generated: number; failed: number; targeted: number }> {
  const log = opts.log ?? (() => {});
  const supabase = createServiceClient();
  let query = supabase
    .from("podcast_episodes")
    .select("id, title, script, status")
    .neq("status", "failed")
    .not("script", "is", null);
  query = opts.retryFailed
    ? query.or("headline.is.null,headline.eq.")
    : query.is("headline", null);
  const { data, error } = await query.order("created_at", { ascending: false }).limit(limit);
  if (error) throw new Error(`회차 조회 실패: ${error.message}`);

  const rows = (data ?? []) as HeadlineEpisodeRow[];
  let generated = 0;
  let failed = 0;
  for (const ep of rows) {
    let headline: string | null = null;
    try {
      headline = await generateEpisodeHeadline(ep.script, ep.title);
    } catch (e) {
      console.error(`[podcast-headline] ${ep.id} ${ep.title} 예외:`, e instanceof Error ? e.message : e);
    }
    if (headline) {
      log(`${ep.title} (${ep.status}) → ${headline}`);
      generated += 1;
    } else {
      log(`${ep.title} (${ep.status}) → (실패 — '' 로 표시, --retry-failed 로 재시도)`);
      failed += 1;
    }
    if (opts.dryRun) continue;
    // 비어 있을 때만 쓴다(null 또는 재시도 대상 '')
    const { error: upErr } = await supabase
      .from("podcast_episodes")
      .update({ headline: headline ?? "" })
      .eq("id", ep.id)
      .or("headline.is.null,headline.eq.");
    if (upErr) console.error(`[podcast-headline] ${ep.id} 저장 실패:`, upErr.message);
  }
  return { generated, failed, targeted: rows.length };
}
