// ============================================================================
// lib/temperature/issues — 이슈 생성(키워드 그룹핑) 경로
//
// 배경: 온도 산출(compute.ts)은 issues 테이블에만 의존하는데, 어디서도 issues 를
//   채우지 않아 항상 "산출 대상 이슈 없음" 으로 끝났다.
//   → 최근 기사를 카테고리로 그룹핑해 이슈를 만든다(라벨=카테고리, 키워드=그룹
//     기사 키워드의 합집합). 이슈 키워드는 compute/scoring 에서 댓글 본문과
//     substring 매칭되어 빈도·토픽집중도 산출에 쓰인다.
//
// - mock 환경(키 없음)에서도 동작한다(외부 호출 없음, 순수 DB 집계).
// - 멱등: 이미 존재하는 라벨은 다시 만들지 않고, 빠진 라벨만 insert 한다.
// - 온도 수식·가중치(formula.ts)는 건드리지 않는다.
// ============================================================================

import { z } from "zod";
import type { createServiceClient } from "@/lib/supabase/server";
import { generateJsonViaCli, isLocalCliMode } from "@/lib/ai/local-cli";
import { recordAlert, resolveAlerts } from "@/lib/alerts";
import { groupDuplicates, isSameIssue, mergeKeywords } from "./dedupe";

type ServiceClient = ReturnType<typeof createServiceClient>;

/** 구독 CLI(codex)로 뽑은 이슈 구조 — label 은 조각이 아닌 짧은 구문. */
const IssueExtractSchema = z.object({
  issues: z
    .array(
      z.object({
        label: z.string().min(2).max(30),
        keywords: z.array(z.string().min(2)).min(1).max(5),
      }),
    )
    .max(12),
});

/** 카테고리가 없는 기사를 묶을 기본 이슈 라벨 */
const UNCATEGORIZED_LABEL = "기타";

/** articles 에서 이슈 생성에 필요한 최소 컬럼 */
interface ArticleSeedRow {
  category: string | null;
  keywords: string[] | null;
  title: string | null;
}

/** 제목에서 이슈 키워드를 뽑을 때 버릴 불용어(형식어·너무 일반적인 지명) */
const TITLE_STOPWORDS = new Set([
  "그리고", "하지만", "오늘", "이번", "관련", "대한", "위해", "까지", "부터",
  "에서", "으로", "라고", "한다", "했다", "있다", "없다", "된다", "되다",
  "기자", "단독", "종합", "속보", "지면", "보기", "우리", "그것", "이것",
  // 너무 일반적인 지명·범용어 → 이슈 토픽으로 부적합(거의 모든 기사에 등장)
  "옥천", "충북", "청주", "지역", "사업", "주민", "이야기", "사람", "우리군",
  // 여론 글에 흔한 형식·감정 필러(토픽 아님)
  "감사", "입장", "수정", "정말", "안녕", "생각", "문제", "때문", "그냥", "제발",
]);

/** 폴백으로 만들 이슈 개수 상한 (온도 보드가 과하지 않게) */
const FALLBACK_ISSUE_LIMIT = 12;

/**
 * 이 개수 이상 이슈가 이미 있으면 생성(특히 codex 호출)을 건너뛴다.
 * 크론이 매 회차 codex 를 부르지 않게 하는 가드 — 이슈는 재생성 불필요.
 */
const MIN_EXISTING_ISSUES = 6;

/** 이슈 보충 주기 — 최신 이슈가 이 시간보다 오래됐을 때만 재생성을 시도한다 */
const ISSUE_REFRESH_HOURS = 20;
/** 재생성 시도 시간대(KST) — 15분 크론이 이 한 시간에만 codex 를 부른다(하루 최대 4회) */
const ISSUE_REFRESH_HOUR_KST = 4;

/** 지금이 KST 재생성 시간대인가 — 서버 타임존과 무관하게 판정 */
function inRefreshWindow(now: Date): boolean {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Seoul",
      hour: "2-digit",
      hour12: false,
    }).format(now),
  );
  return hour === ISSUE_REFRESH_HOUR_KST;
}

/**
 * 최근 기사(lookbackDays 내)를 카테고리로 그룹핑해 issues 를 채운다.
 * 이미 같은 label 의 이슈가 있으면 건너뛰고, 새 라벨만 insert 한다(멱등).
 *
 * @returns 이 호출로 새로 생성된 이슈 수
 */
export async function ensureIssuesFromArticles(
  supabase: ServiceClient,
  now: Date,
  lookbackDays: number,
): Promise<number> {
  // ⚡ 이미 이슈가 충분하면 생성 로직 전체(특히 codex 호출)를 건너뛴다.
  //   카테고리/키워드가 null 인 크롤 기사 특성상 매 크론(15분)마다 codex 를 불러
  //   결과를 버리던 낭비 → CPU 고부하로 사이트가 스켈레톤만 뜨던 문제를 막는다.
  //   다만 **하루 한 번(KST 04시대)은 최근 기사로 새 이슈를 보충**한다. 그러지 않으면
  //   8월에 만든 키워드가 그대로 굳어 최근 댓글과 한 건도 겹치지 않고 온도가 전부 0이 된다
  //   (2026-09-10 실측: 이슈 12건이 8/7 생성 후 한 달 방치 → 12건 모두 0도).
  //   insert 는 라벨 기준 멱등이라 이미 있는 이슈는 늘어나지 않는다.
  const { data: existing, error: existingErr } = await supabase
    .from("issues")
    .select("id, created_at")
    .order("created_at", { ascending: false });
  const enough = !existingErr && (existing?.length ?? 0) >= MIN_EXISTING_ISSUES;
  if (enough) {
    const newest = existing?.[0]?.created_at
      ? new Date(existing[0].created_at as string).getTime()
      : 0;
    const staleHours = (now.getTime() - newest) / 3_600_000;
    if (staleHours < ISSUE_REFRESH_HOURS || !inRefreshWindow(now)) return 0;
  }

  const since = new Date(
    now.getTime() - lookbackDays * 24 * 60 * 60 * 1000,
  ).toISOString();

  // 1) 최근 기사의 카테고리·키워드·제목 로드
  //    공고(kind='notice')는 여론 이슈 토픽이 아니고, category='공고' 로 뭉쳐
  //    폴백(제목·여론 기반 토픽 보드)을 가로채므로 온도 이슈 생성에서 제외한다.
  const { data, error } = await supabase
    .from("articles")
    .select("category, keywords, title")
    .neq("kind", "notice")
    .gte("published_at", since);
  if (error) {
    throw new Error(`이슈 생성용 기사 로드 실패: ${error.message}`);
  }
  const rows = (data ?? []) as ArticleSeedRow[];
  if (rows.length === 0) return 0;

  // 2) 카테고리별 키워드 합집합으로 이슈 후보 구성
  let grouped = groupByCategory(rows);

  // 2-fallback) 카테고리·키워드가 비어 아무 그룹도 안 나오면(크롤 기사엔 흔함)
  //   기사 제목 + 최근 여론 댓글에서 토픽 토큰을 뽑아 이슈를 만든다. 이게 없으면
  //   온도 산출이 영구히 "산출 대상 이슈 없음" 으로 막힌다(실측: 243기사 전부
  //   category/keywords null). 댓글 토큰도 함께 세어, 주민이 실제 얘기하는 토픽
  //   (군의원·철도 등)이 이슈로 올라오고 반드시 매칭되도록 한다.
  if (grouped.size === 0) {
    const { data: commentData, error: commentError } = await supabase
      .from("comments")
      .select("body")
      .gte("published_at", since);
    if (commentError) {
      throw new Error(`이슈 생성용 댓글 로드 실패: ${commentError.message}`);
    }
    const commentBodies = ((commentData ?? []) as { body: string | null }[])
      .map((c) => c.body ?? "")
      .filter(Boolean);
    // [#81] codex 로 의미있는 이슈 라벨(짧은 구문)을 뽑는다. 이미 있는 이슈를 알려 주어 변형 재생성을 줄인다(#183).
    const { data: existingForPrompt } = await supabase
      .from("issues")
      .select("label")
      .order("created_at", { ascending: false })
      .limit(60);
    const viaCli = await deriveFallbackIssuesViaCli(
      rows.map((r) => r.title ?? ""),
      commentBodies,
      ((existingForPrompt ?? []) as { label: string }[]).map((r) => r.label),
    );
    if (viaCli) {
      grouped = viaCli;
      // codex 가 다시 성공했으면 이전 실패 경고를 걷는다(#189 — 10/12 경고가 성공 뒤에도 남아 있었다)
      await resolveAlerts(supabase, "temp_issues_codex_failed");
    } else if (isLocalCliMode()) {
      // ⚠️ 구독 CLI(codex)가 설정돼 있는데 실패한 경우 — **조각 라벨(단어 토큰)
      //    더미를 만들지 않는다.** 크론 환경(codex 세션 부재)에서 실패하면
      //    "건의문·군의원·가격" 같은 조각 이슈가 15분마다 재삽입돼 온도 보드를
      //    오염시키던 문제를 차단한다(사용자 방침: 목업/조각 더미 금지).
      //    기존 codex 이슈는 그대로 두고, 관리자 경고만 남긴 뒤 이번 회차는 스킵.
      await recordCodexIssueAlert(supabase);
      return 0;
    } else {
      // 구독 CLI 완전 비활성(AI_MOCK 등)일 때만 토큰 폴백을 허용한다.
      grouped = deriveFallbackIssues(rows, commentBodies);
    }
  }
  if (grouped.size === 0) return 0;

  // 3) 기존 이슈와 **같은 사안**(lib/temperature/dedupe)이면 새로 만들지 않고 키워드만 합친다(#183).
  //    라벨 문자열 일치만 보던 때는 같은 사안이 라벨만 바뀐 채 매일 쌓였다(169건 중 124건이 변형).
  const { data: existingData, error: existingError } = await supabase
    .from("issues")
    .select("id, label, keywords");
  if (existingError) {
    throw new Error(`기존 이슈 조회 실패: ${existingError.message}`);
  }
  const existingIssues = (existingData ?? []) as { id: string; label: string; keywords: string[] | null }[];

  // 후보끼리도 먼저 합친다(한 회차 안의 변형)
  const candidates = groupDuplicates([...grouped.entries()].map(([label, keywords]) => ({ label, keywords }))).map((g) => ({
    label: g[0].label,
    keywords: mergeKeywords(g[0].keywords, g.slice(1).flatMap((x) => x.keywords ?? [])),
  }));

  const toInsert: { label: string; keywords: string[] }[] = [];
  let merged = 0;
  for (const c of candidates) {
    const same = existingIssues.find((e) => e.label === c.label || isSameIssue(e, c));
    if (!same) {
      toInsert.push(c);
      continue;
    }
    const union = mergeKeywords(same.keywords, c.keywords);
    if (union.length > (same.keywords ?? []).length) {
      const { error: uErr } = await supabase.from("issues").update({ keywords: union }).eq("id", same.id);
      if (uErr) console.error(`[issues] 키워드 병합 실패(${same.label}):`, uErr.message);
      else {
        same.keywords = union;
        merged += 1;
      }
    }
  }
  if (merged > 0) console.log(`[issues] 기존 사안에 키워드 병합 ${merged}건(새 이슈로 만들지 않음)`);

  if (toInsert.length === 0) return 0;

  const { error: insertError } = await supabase.from("issues").insert(toInsert);
  if (insertError) {
    throw new Error(`이슈 생성 실패: ${insertError.message}`);
  }
  return toInsert.length;
}

/**
 * 기사 행들을 카테고리 라벨 → 키워드 합집합 맵으로 묶는다.
 * - category 가 비면 "기타" 버킷으로.
 * - 키워드는 대소문자 무시로 중복 제거하되 원본 표기를 유지한다.
 */
function groupByCategory(rows: ArticleSeedRow[]): Map<string, string[]> {
  const labelToKeywords = new Map<string, Map<string, string>>();

  for (const row of rows) {
    const label = (row.category ?? "").trim() || UNCATEGORIZED_LABEL;
    const bucket = labelToKeywords.get(label) ?? new Map<string, string>();
    for (const kw of row.keywords ?? []) {
      const trimmed = kw.trim();
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();
      if (!bucket.has(key)) bucket.set(key, trimmed);
    }
    labelToKeywords.set(label, bucket);
  }

  const result = new Map<string, string[]>();
  for (const [label, keywords] of labelToKeywords) {
    // 키워드가 하나도 없는 카테고리는 댓글 매칭이 불가능하므로 이슈로 만들지 않는다.
    if (keywords.size === 0) continue;
    result.set(label, [...keywords.values()]);
  }
  return result;
}

/**
 * 제목 문자열에서 토픽 후보 토큰을 뽑는다.
 * - 대괄호 머리표([기고]·[편집국에서] 등)와 따옴표 제거
 * - 한글/영숫자 경계로 분절, 길이 2~12, 불용어 제외
 */
function tokenizeTitle(title: string | null): string[] {
  // 용언 활용/연결어미로 끝나는 조각(짜고·치는·아는·외면하는·올해는 등)은 토픽이 아니다.
  // 명사 어미와 겹치지 않는 것만 보수적으로 나열(도·의·서·지 등은 명사에 흔해 제외).
  // 용언 종결/연결어미로 끝나는 조각(감사합니다·짜고·치는·올해는 등)은 토픽이 아니다.
  const VERB_TAIL = /(다|는|고|게|며|던|야|죠|요|한|할|해)$/;
  return (title ?? "")
    .replace(/\[[^\]]*\]/g, " ")
    .split(/[^0-9A-Za-z가-힣]+/)
    .map((t) => t.trim())
    // 명사에 거의 안 붙는 목적격·부사격 조사만 보수적으로 벗김(주민을→주민, 건의문에→건의문).
    // 도·의·로·과·와 등은 복합명사 끝(철도·질의·도로)과 겹쳐 제외.
    .map((t) => (t.length >= 3 ? t.replace(/(을|를|에)$/, "") : t))
    .filter(
      (t) =>
        t.length >= 2 &&
        t.length <= 12 &&
        !/^\d+$/.test(t) && // 숫자만인 토큰(000·2026 등) 제외
        !TITLE_STOPWORDS.has(t) &&
        !VERB_TAIL.test(t),
    );
}

/**
 * category/keywords 가 비어 있을 때의 폴백: 최근 기사 제목 + 여론 댓글에서 가장
 * 빈번한 토픽 토큰들을 이슈로 만든다(라벨=키워드=토큰). 빈도 상위
 * FALLBACK_ISSUE_LIMIT 개만 취해 보드가 과하지 않게 한다.
 *
 * 기사 토큰(뉴스 의제)과 댓글 토큰(주민 여론)을 함께 세어, 실제로 여론이 붙는
 * 토픽이 이슈로 승격되고 온도 매칭이 보장되도록 한다.
 *
 * 반환 형태는 groupByCategory 와 동일(라벨→키워드 배열)이라 이후 경로가 그대로 동작.
 */
/**
 * [#81] 구독 CLI(codex)로 의미있는 이슈를 뽑는다. 토큰 폴백은 라벨이 단어 조각
 * (건의문·가격과)이라 크로스뷰/여론 매칭이 나빴다 — codex 로 "지방의원 해외연수
 * 논란" 같은 짧은 구문 라벨 + 매칭 키워드를 얻는다. CLI 비활성/실패 시 null →
 * 호출부가 토큰 폴백으로 내려간다.
 */
/**
 * codex 이슈 라벨 생성 실패 경고를 남긴다. 15분 주기 크론에서 매번 실패하면
 * 경고가 쌓이므로, **미해결(resolved=false) 동일 종류 경고가 없을 때만 1회** 기록한다.
 */
async function recordCodexIssueAlert(supabase: ServiceClient): Promise<void> {
  try {
    const { data } = await supabase
      .from("system_alerts")
      .select("id")
      .eq("kind", "temp_issues_codex_failed")
      .eq("resolved", false)
      .limit(1);
    if (data && data.length > 0) return; // 이미 미해결 경고 존재 — 스팸 방지
  } catch {
    /* 조회 실패는 무시하고 아래 기록을 시도한다 */
  }
  await recordAlert(
    supabase,
    "temp_issues_codex_failed",
    "온도 이슈 라벨 생성(codex) 실패 — 조각 더미를 만들지 않고 이번 회차 이슈 생성을 " +
      "스킵했습니다. 기존 이슈는 유지됩니다. codex CLI 세션/설정을 확인하세요.",
    { severity: "warning" },
  );
}

async function deriveFallbackIssuesViaCli(
  titles: string[],
  commentBodies: string[],
  existingLabels: string[] = [],
): Promise<Map<string, string[]> | null> {
  if (!isLocalCliMode()) return null;
  const corpus = [
    "[최근 기사 제목]",
    ...titles.filter(Boolean).slice(0, 60),
    "",
    "[주민 여론]",
    ...commentBodies.slice(0, 40),
    ...(existingLabels.length > 0
      ? ["", "[이미 있는 이슈 — 같은 사안은 다시 만들지 말고, 정말 새로운 사안만]", ...existingLabels]
      : []),
  ].join("\n");
  const out = await generateJsonViaCli(IssueExtractSchema, {
    label: "temp-issues",
    system:
      "당신은 지역 여론 분석가다. 아래 기사 제목과 주민 여론에서 '실제로 논의되는 " +
      "지역 이슈'만 추린다. 각 이슈의 label 은 단어 조각이 아니라 사람이 이해하는 " +
      "짧은 구문(예: '지방의원 해외연수 논란', '옥천 균형발전사업 선정')으로 쓴다. " +
      "keywords 는 그 이슈를 다룬 기사·글을 찾을 매칭용 명사구 1~5개다. 서로 다른 " +
      "이슈만, 최대 12개. '[이미 있는 이슈]' 목록과 같은 사안은 제외한다.",
    prompt: corpus,
    format:
      '{"issues":[{"label":"<이슈 구문>","keywords":["<매칭어>", ...]}, ...]}',
  });
  if (!out) return null;
  const result = new Map<string, string[]>();
  for (const it of out.issues.slice(0, FALLBACK_ISSUE_LIMIT)) {
    const label = it.label.trim();
    const keywords = it.keywords.map((k) => k.trim()).filter(Boolean);
    if (label && keywords.length && !result.has(label)) {
      result.set(label, keywords);
    }
  }
  return result.size > 0 ? result : null;
}

function deriveFallbackIssues(
  rows: ArticleSeedRow[],
  commentBodies: string[],
): Map<string, string[]> {
  const countTokens = (texts: string[]): Map<string, number> => {
    const freq = new Map<string, number>();
    for (const text of texts) {
      // 한 문서 내 중복 토큰은 1회만 센다(반복어 가중 방지)
      for (const token of new Set(tokenizeTitle(text))) {
        freq.set(token, (freq.get(token) ?? 0) + 1);
      }
    }
    return freq;
  };

  const result = new Map<string, string[]>();
  const add = (token: string): void => {
    if (result.size < FALLBACK_ISSUE_LIMIT && !result.has(token)) {
      result.set(token, [token]);
    }
  };

  // 1) 여론(댓글) 토큰 우선 — 온도 신호의 원천이므로 이슈로 만들면 매칭이 보장된다.
  //    빈도 1도 허용(여론 표본이 작다). 빈도 내림차순.
  const commentFreq = countTokens(commentBodies);
  for (const [token] of [...commentFreq.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  )) {
    add(token);
  }

  // 2) 남는 자리는 기사 제목의 빈번 토픽(뉴스 의제)으로 채운다(빈도 ≥2).
  const titleFreq = countTokens(rows.map((r) => r.title ?? ""));
  for (const [token] of [...titleFreq.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
    add(token);
  }

  return result;
}
