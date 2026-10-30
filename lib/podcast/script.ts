// ============================================================================
// lib/podcast/script — 대본에서 "대표 내용"(예고 문장 + 사안 키워드 + 표시용 헤드라인) 뽑기
//
// Figma 코멘트 #4(2026-09-11): 목록 제목이 "오늘의 충북 9월 8일"(날짜)이라 내용 축약이
// 아니다 → episodeHeadline() 이 topics 로 내용 요약 헤드라인을 지어 화면 제목으로 쓴다
// (파일 아래쪽 블록. DB 의 episodes.title 은 그대로 두고 표시만 바꾼다).
//
// 회의 결정 [7]: 팟캐 목록이 날짜만 있어 클릭 유인이 약하다 → 날짜는 작게,
// 대표 내용(lead 문장 + topics 키워드)을 함께 보여준다.
//
// 대본 구조는 lib/podcast/generate 파이프라인이 늘 같은 꼴로 만든다(실측 6회차):
//   0  안녕하십니까. … ‘오늘의 충북’, 9월 8일 방송입니다.
//   1  먼저 오늘의 헤드라인입니다.
//   2  <헤드라인 첫 문장>            ← lead
//   …  이어서 주요 사안을 자세히 살펴보겠습니다.   ← 전환 문장(제외)
//   …  먼저 지방 재정 문제입니다. / 다음은 지역의사제입니다. / 교육 소식입니다.  ← topics
//
// 정규식·휴리스틱이라 구조가 달라지면 조용히 빈 값으로 떨어진다(빈 배열·빈 문자열).
// 외부 의존 없는 순수 함수 — 서버 컴포넌트(/podcast)·API 라우트가 주 사용처지만
// 홈 슬라이드(클라이언트)도 같은 결과를 쓰라고 "server-only" 는 붙이지 않는다.
// 셀프체크: `pnpm exec tsc lib/podcast/script.ts --outDir <tmp> --module commonjs` 로 뽑아
//           실제 회차 대본 3개 이상을 넣고 lead·topics 를 눈으로 확인한다(2026-09-10 6회차 통과).
// ============================================================================

/** 목록·시트에 얹는 예고 정보 */
export interface EpisodeTeaser {
  /** 대표 문장 1개 (60자 넘으면 말줄임). 못 뽑으면 "" */
  lead: string;
  /** 사안 키워드 2~3개. 못 뽑으면 [] */
  topics: string[];
}

/** lead 최대 길이(말줄임 포함) */
const LEAD_MAX = 60;
/** 키워드 하나의 최대 길이 — 이보다 길면 문장에 가까워 버린다 */
const TOPIC_MAX = 20;
/** 키워드 최대 개수 */
const TOPIC_LIMIT = 3;

/** 인사말 줄 — 회차 소개라 lead 로 쓰지 않는다 */
const GREETING_RE = /^(안녕하|반갑)|방송입니다[.!]?$/;
/** "먼저 오늘의 헤드라인입니다." / "오늘 다룰 주요 소식은 다음과 같습니다." — 이 다음 줄이 lead.
 *  뒤쪽은 AI 없이 만든 폴백 대본(lib/ai/podcast.ts)의 표기다 — 안내 문장 자체가 lead 로
 *  뽑혀 모든 회차가 같은 제목이 되던 것을 막는다. */
const HEADLINE_RE = /헤드라인입니다|주요\s*소식은\s*다음과\s*같습니다/;
/** 번호 목록 머리("1. ") — 헤드라인 목록 줄에서 떼고 읽는다 */
const LIST_MARK_RE = /^\d+\s*[.)]\s*/;

/** 사안 도입 문장 앞머리(순서말). 본문에도 흔한 "또한·한편·그리고" 는 뺐다(오검출) */
const ORDINAL_RE =
  /^(?:먼저|우선|다음은|다음으로|이어서|이어|이제|끝으로|마지막으로|둘째로?|셋째로?|넷째로?|두\s*번째(?:는|로|으로)?|세\s*번째(?:는|로|으로)?|네\s*번째(?:는|로|으로)?|다섯\s*번째(?:는|로|으로)?)\s+/;
/** 사안 도입임을 드러내는 서술어("… 살펴보겠습니다") */
const INTRO_VERB_RE =
  /(?:살펴보겠습니다|짚어보겠습니다|들여다보겠습니다|알아보겠습니다|전해드리겠습니다|짚어봅니다|보겠습니다)[.!]?$/;
import { region } from "@/config/region";

/** 설정의 이름을 정규식 조각으로 — 메타문자 이스케이프, 띄어쓰기는 `\s*`(대본이 붙여 쓰기도 한다) */
function nameToPattern(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("\\s*");
}

/** 도입 문장은 짧다 — 이보다 길면 본문 문장으로 본다 */
const INTRO_MAX = 45;
/** 사안 도입 문장 꼬리(조사 + 서술어) */
const TAIL_RE =
  /\s*(?:도|은|는|을|를|에\s*대해서?|에\s*관해서?)?\s*(?:조금\s*더\s*)?(?:자세히\s*)?(?:살펴보겠습니다|짚어보겠습니다|들여다보겠습니다|알아보겠습니다|전해드리겠습니다|짚어봅니다|보겠습니다|입니다|이었습니다|였습니다)[.!]?$/;
/** 꼬리에 붙는 갈래 명사 — 앞말이 명사면 떼고, 관형형(…ㄴ/…ㄹ)이면 남긴다 */
const CATEGORY_RE = /\s*(?:문제|소식|사안|이야기|논란|현안|상황|사고|사건|이슈|이야깁니다)$/;
/** 내용이 없는 진행 멘트 — 키워드로 쓰지 않는다 */
const GENERIC_RE = new RegExp(
  `헤드라인|사안|자세히|이야기를|정리|마무리|인사|${nameToPattern(region.podcast.seriesName)}|${nameToPattern(region.podcast.localCorner)}|방송`,
); // "이어서 오늘의 옥천 소식입니다." 는 코너 전환문(#166), 사안이 아니다

/** 앞뒤 공백·따옴표를 정리한 줄 배열 (빈 줄 제거) */
function toLines(script: string | null | undefined): string[] {
  return String(script ?? "")
    .replace(/\r\n?/g, "\n")
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * 줄의 첫 문장. 소수점("61.7%")에서 잘리지 않게 마침표 앞이 숫자면 문장 끝으로 보지 않는다.
 */
function firstSentence(line: string): string {
  const m = line.match(/^([\s\S]*?[^\d\s][.!?…])(?:\s|$)/);
  return (m ? m[1] : line).trim();
}

/** 60자 규칙 말줄임 — 낱말 중간이 아니라 마지막 띄어쓰기에서 끊고 … 를 붙인다 */
function clamp(text: string, max: number): string {
  if (text.length <= max) return text;
  const head = text.slice(0, max - 1);
  const space = head.lastIndexOf(" ");
  const cut = space > max * 0.6 ? head.slice(0, space) : head;
  return `${cut.trimEnd().replace(/[,·]$/, "")}…`;
}

/** 한글 음절의 종성이 ㄴ/ㄹ 이면 관형형일 확률이 높다("벌어진", "안타까운") */
function looksAdnominal(word: string): boolean {
  const ch = word.codePointAt(word.length - 1);
  if (ch === undefined || ch < 0xac00 || ch > 0xd7a3) return false;
  const jong = (ch - 0xac00) % 28;
  return jong === 4 || jong === 8; // ㄴ, ㄹ
}

/**
 * 사안 도입 문장 → 핵심 명사구. 도입 문장이 아니면 "".
 * 예) "다음은 제천의 교정시설 유치 문제입니다." → "제천의 교정시설 유치"
 */
function toTopic(sentence: string): string {
  if (GENERIC_RE.test(sentence) || sentence.length > INTRO_MAX) return "";
  const body = sentence.replace(ORDINAL_RE, "").trim();
  const hasOrdinal = body !== sentence;
  if (!body) return "";
  const stripped = body.replace(TAIL_RE, "").trim();
  // 꼬리(서술어)를 못 떼면 도입 문장이 아니다
  if (!stripped || stripped === body) return "";
  // 도입 문장의 표식: 순서말 / "살펴보겠습니다" / 갈래 명사("… 소식입니다").
  // 셋 다 없으면 본문 문장이다("문제는 그다음입니다" 같은 오검출 차단).
  if (!hasOrdinal && !INTRO_VERB_RE.test(sentence) && !CATEGORY_RE.test(stripped)) return "";

  // 갈래 명사("… 문제") 제거 — 단, 앞말이 관형형이면 남긴다("안타까운 사고")
  const cat = stripped.match(CATEGORY_RE);
  let topic = stripped;
  if (cat) {
    const head = stripped.slice(0, stripped.length - cat[0].length).trim();
    const lastWord = head.split(/\s+/).pop() ?? "";
    if (head.length >= 2 && !looksAdnominal(lastWord)) topic = head;
  }

  topic = topic.replace(/^[‘’“”'"(]+|[’”'")]+$/g, "").trim();
  if (topic.length < 2 || topic.length > TOPIC_MAX) return "";
  if (GENERIC_RE.test(topic)) return "";
  return topic;
}

/** 헤드라인 첫 문장(없으면 인사 다음 문장) → lead */
function pickLead(lines: string[]): string {
  const headIdx = lines.findIndex((l) => HEADLINE_RE.test(l));
  const candidates =
    headIdx >= 0 ? lines.slice(headIdx + 1) : lines.filter((l) => !GREETING_RE.test(l));

  for (const line of candidates) {
    if (GREETING_RE.test(line) || HEADLINE_RE.test(line)) continue;
    const s = firstSentence(line.replace(LIST_MARK_RE, ""));
    if (s.length >= 10) return clamp(s, LEAD_MAX);
  }
  return "";
}

/**
 * 대본에서 예고(lead + topics)를 뽑는다. 휴리스틱이 실패하면 빈 값으로 떨어진다.
 * 순수 함수 — 같은 대본이면 서버·클라이언트 어디서 돌려도 같은 결과가 나온다.
 */
export function episodeTeaser(script: string | null | undefined): EpisodeTeaser {
  const lines = toLines(script);
  if (lines.length === 0) return { lead: "", topics: [] };

  const topics: string[] = [];
  for (const line of lines) {
    const topic = toTopic(firstSentence(line));
    if (topic && !topics.includes(topic)) topics.push(topic);
    if (topics.length >= TOPIC_LIMIT) break;
  }

  return { lead: pickLead(lines), topics };
}

/** lead 만 필요할 때(API 목록·시트) */
export function episodeLead(script: string | null | undefined): string {
  return pickLead(toLines(script));
}

// ── 표시용 헤드라인 (Figma 코멘트 #4) ──────────────────────────────────────
// 디자인 검토(2026-09-11): "제목=내용축약이므로 대본 발췌부분 삭제". 그런데 DB 의
// episodes.title 은 "오늘의 충북 9월 8일" 처럼 날짜라서 내용 축약이 아니다.
// → DB 제목은 그대로 두고(회차 식별용), 화면 제목만 topics 로 지은 헤드라인으로 바꾼다.
//   예) "지방 재정과 제천의 교정시설 유치"
// 순서: topics 2개 이상 → 두 사안 잇기 / 부족하면 lead 를 절 경계에서 40자로 / topics 1개 →
//       그 사안 / 아무것도 못 뽑으면 fallbackTitle(날짜 제목).

/** 헤드라인 최대 길이 — 목록 제목이 세 줄로 넘어가지 않는 선 */
const HEADLINE_MAX = 44;
/** 대본에서 아무것도 못 뽑고 날짜 제목조차 없을 때의 마지막 라벨 */
const HEADLINE_FALLBACK = region.podcast.seriesName;
/** lead 를 헤드라인으로 쓸 때의 길이(꼬리가 없으니 더 짧게) */
const HEADLINE_LEAD_MAX = 40;
/** 헤드라인으로 쓸 만한 최소 길이 — 이보다 짧으면 다음 후보로 내려간다 */
const HEADLINE_MIN = 10;

/**
 * 헤드라인 표시용 정리 — 여러 글자로 된 꼬리 조사만 뗀다.
 * ("충북 예산부터" → "충북 예산"). 한 글자 조사는 여기서 떼지 않는다 —
 * "행정수도"의 "도", "추가"의 "가" 처럼 낱말의 일부를 깎아 먹는다.
 */
function displayTopic(topic: string): string {
  return topic
    .replace(/\s+/g, " ")
    .replace(/(?:부터|까지|에서|으로서|로서|이라는|라는)$/, "")
    .trim();
}

/**
 * 중복 비교용 키 — 한 글자 조사까지 떼서 "충북 예산은"과 "충북 예산"을 같은 사안으로 본다.
 * 표시에는 절대 쓰지 않는다(위 displayTopic 주석의 이유).
 */
function topicKey(topic: string): string {
  const t = displayTopic(topic).replace(/(?:은|는|이|가|을|를|도|의|와|과|랑)$/, "");
  return t.length >= 2 ? t : displayTopic(topic);
}

/**
 * 같은 말·포함 관계는 하나만 남긴다.
 * ("의료 공백" + "의료 공백 대책" → 더 구체적인 "의료 공백 대책",
 *  "충북 예산은" + "충북 예산까지" → 조사 없는 "충북 예산")
 */
function dedupeTopics(topics: string[]): string[] {
  const out: string[] = [];
  for (const t of topics.map(displayTopic).filter((v) => v.length >= 2)) {
    const key = topicKey(t);
    const i = out.findIndex((o) => {
      const ok = topicKey(o);
      return ok === key || ok.includes(key) || key.includes(ok);
    });
    if (i === -1) {
      out.push(t);
      continue;
    }
    const kept = topicKey(out[i]);
    if (key.length > kept.length) out[i] = t; // 더 구체적인 사안
    else if (key === kept && t.length < out[i].length) out[i] = t; // 같은 사안이면 조사 없는 쪽
  }
  return out;
}

/** 앞말 종성 유무로 "와/과" 를 고른다("송전선로와", "기본소득과") */
function joinParticle(word: string): string {
  const ch = word.codePointAt(word.length - 1);
  if (ch === undefined || ch < 0xac00 || ch > 0xd7a3) return "와"; // 한글이 아니면 기본 "와"
  return (ch - 0xac00) % 28 === 0 ? "와" : "과";
}

/**
 * 문장을 절 경계에서 끊는다 — 쉼표·중점이 있으면 거기서, 없으면 마지막 띄어쓰기에서 … 를 붙인다.
 * 헤드라인이라 문장 끝 마침표는 뗀다.
 */
function clampClause(text: string, max: number): string {
  const t = text
    .replace(/\s+/g, " ")
    .replace(/[.!?…]+$/, "")
    .trim();
  if (t.length <= max) return t;
  // 말줄임표(1자)까지 세어 상한을 넘기지 않는다
  const head = t.slice(0, max - 1);
  const comma = Math.max(head.lastIndexOf(","), head.lastIndexOf("·"));
  // 절 경계가 너무 앞이면(절반 미만) 토막만 남으니 띄어쓰기 말줄임으로 간다
  if (comma > max * 0.5) return head.slice(0, comma).trim();
  const space = head.lastIndexOf(" ");
  const cut = space > max * 0.5 ? head.slice(0, space) : head;
  return `${cut.trimEnd().replace(/[,·]$/, "")}…`;
}

/**
 * 화면 제목 — DB 에 저장된 codex 헤드라인(episodes.headline, 0020)이 있으면 그것,
 * 없으면 아래 episodeHeadline 휴리스틱, 그래도 없으면 날짜 제목.
 * 모든 목록·슬라이드·레일·시트가 이 하나를 쓴다.
 */
export function episodeDisplayHeadline(ep: {
  headline?: string | null;
  script?: string | null;
  title?: string | null;
}): string {
  const stored = ep.headline?.trim();
  if (stored) return stored;
  return episodeHeadline(ep.script, ep.title);
}

/**
 * 대본 → 화면에 쓸 내용 요약 헤드라인(휴리스틱 폴백). 못 지으면 fallbackTitle(날짜 제목).
 * 순수 함수 — DB(episodes.title)는 건드리지 않고 표시만 바꾼다.
 */
export function episodeHeadline(
  script: string | null | undefined,
  fallbackTitle?: string | null,
): string {
  const fallback = String(fallbackTitle ?? "").trim();
  const { lead, topics: raw } = episodeTeaser(script);
  // 조사·중복을 먼저 정리한다 — 이어 붙이기 전에 해야 "예산과 예산" 이 안 나온다
  const topics = dedupeTopics(raw);

  // 1) 사안 두 개를 "A와 B" 로 잇는다. 꼬리("— 오늘의 충북")는 붙이지 않는다 —
  //    목록의 모든 행에 같은 말이 반복되면 정작 다른 부분(사안)을 읽는 데 방해가 된다.
  if (topics.length >= 2) {
    const [a, b] = topics;
    // 뒤 사안에 이미 "와/과" 가 들어 있으면("충북도와 충북교육청의 …") 조사를 겹치지 않게 중점으로 잇는다
    const joined = /[와과]\s/.test(b)
      ? `${a} · ${b}`
      : `${a}${joinParticle(a)} ${b}`;
    if (joined.length <= HEADLINE_MAX) return joined;
    // 두 사안이 다 들어가지 않으면 절 경계에서 끊는다(앞 사안 하나만 남기는 것보다 정보가 많다)
    return clampClause(joined, HEADLINE_MAX);
  }

  // 2) topics 가 부족하면 헤드라인 첫 문장을 절 경계에서 끊어 쓴다
  if (lead) {
    const clause = clampClause(lead, HEADLINE_LEAD_MAX);
    if (clause.length >= HEADLINE_MIN) return clause;
  }

  // 3) 사안 하나라도 있으면 그것, 아니면 날짜 제목
  if (topics.length === 1) return clampClause(topics[0], HEADLINE_MAX);
  return fallback || HEADLINE_FALLBACK;
}
