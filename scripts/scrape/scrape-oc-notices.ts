// ============================================================================
// scripts/scrape/scrape-oc-notices — 옥천군청 공고 게시판 4종 수집 (지원사업·모집·혜택 정보)
//
// 배경: 크로스뷰(뉴스쌍) 외에 주민 대상 "생활정보/혜택 카드"(마감 D-day·신청)를
//   실데이터로 채우려면 지자체 공고가 필요하다. 옥천군청 표준 게시판(plain HTML)
//   4종을 페이징 수집한다(회의 결정 [4·5]).
//     공지사항 bbsNo=36 key=232 · 고시공고 bbsNo=40 key=236
//     입법예고 bbsNo=41 key=237 · 채용공고 bbsNo=42 key=239
//   네 게시판 모두 목록 tr 의 td 순서가 [번호|제목|담당부서|작성일|조회수|파일] 로 같고
//   상세도 td.p-table__content 로 같다(2026-09 curl 확인) — 파서 하나로 처리한다.
//   채용공고만 td 가 8개로 뒤에 [접수시작일|마감일]("YYYY-MM-DD")이 더 붙는다.
//
// 적재: articles (source='oc_gov', kind='notice', category=게시판 한글명,
//   external_id='oc-notice-<bbsNo>-<nttNo>', title, url=상세, keywords=제목 토픽,
//   published_at=공고일, body=본문 앞 2,000자,
//   raw={notno,dept,board,deadline,period}). kind='notice'라 크로스뷰(news) 매칭 제외.
//   개인정보 없음(담당부서명만) — 해시 불필요.
//   · external_id 는 고시공고(bbsNo=40)만 기존 형식 'oc-notice-<nttNo>' 를 유지한다
//     — 2026-09 이전 적재분과 중복 행이 생기지 않게.
//   · raw.board = 'notice'|'gosi'|'legis'|'recruit' — /notices 게시판 필터가 읽는다.
//
// 마감일(검토 의견 [공고 1]): 목록 수집 뒤 각 공고 상세(VIEW)를 400ms 간격으로 받아
//   본문(td.p-table__content)에서 "(신청|접수|모집|공고|열람|공람|의견제출)기간: 시작 ~ 끝"
//   또는 "~ 끝까지" 를 찾아 끝 날짜를 raw.deadline("YYYY-MM-DD"), 원문 구간을 raw.period 에
//   넣는다. 날짜 형식은 "2026년 9월 22일" / "2026. 9. 22." / "2026-09-22" / "9월 22일"
//   (연도 없으면 시작일 연도 → 게시 연도, 연말→연초 역전이면 종료 연도 +1).
//   주민 기준 마감이 우선이라 라벨 우선순위는 신청 > 접수 > 모집 > 의견제출·공람 > 열람 > 공고.
//   기간 라벨 경로는 범위 구분자(~·-·부터) 뒤 종료 날짜가 있어야 하고, 단일 날짜는
//   "…까지"가 날짜에 직접 붙은 경우만 마감으로 본다. "별도 공지 시까지/상시/계속/소진 시"는 null.
//   홈 마감 띠·/notices 마감 정렬이 이 값을 읽는다(부분 인덱스 0018).
//   채용공고(bbsNo=42)는 목록에 마감일 칸이 따로 있어 그 값을 본문 파싱보다 우선한다
//   (구조화된 값이라 오탐이 없다). 칸이 비어 있으면 다른 게시판과 똑같이 본문에서 찾는다.
//
// 보존 원칙(codex 리뷰): 상세 fetch 실패·본문 추출 실패(유지보수 페이지, 마크업 변경)는
//   같은 "실패"로 보고 목록 정보만 갱신, 기존 raw.deadline/period/body 는 유지한다.
//   성공 건도 기존 raw 를 읽어 병합하되 검증된 필드만 갱신 — 파싱이 null 이면 기존 값 유지
//   (파서 결과로 기존 값을 지우려면 --reparse). 기존 raw 조회가 실패하면 upsert 하지 않고 중단.
//
// 실행: pnpm tsx scripts/scrape/scrape-oc-notices.ts [lookbackDays=60] [maxPages=20] [--reparse]
//   (maxPages 는 게시판 하나당 페이지 수. 게시판 4종을 차례로 돈다)
//   파서 자가 테스트: pnpm tsx scripts/scrape/scrape-oc-notices.ts --selftest
// ============================================================================
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv(): void {
  const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  for (const l of raw.split("\n")) {
    const t = l.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    if (process.env[t.slice(0, i)] === undefined) process.env[t.slice(0, i)] = t.slice(i + 1);
  }
}

const UA = "ZONE2Bot/1.0 (+https://github.com/MBC-ZONE2/zone-2-oss)";

/** 게시판 슬러그 — raw.board 값. /notices 의 ?board= 쿼리와 같은 어휘 */
type BoardSlug = "notice" | "gosi" | "legis" | "recruit";

interface Board {
  /** 군청 게시판 파라미터 */
  key: number;
  bbs: number;
  slug: BoardSlug;
  /** articles.category 에 그대로 들어가는 한글 게시판명 */
  label: string;
}

/** 수집 대상 게시판 4종(회의 결정 [4]) — 순서가 곧 수집 순서 */
const BOARDS: Board[] = [
  { key: 232, bbs: 36, slug: "notice", label: "공지사항" },
  { key: 236, bbs: 40, slug: "gosi", label: "고시공고" },
  { key: 237, bbs: 41, slug: "legis", label: "입법예고" },
  { key: 239, bbs: 42, slug: "recruit", label: "채용공고" },
];

const LIST = (b: Board, page: number) =>
  `https://www.oc.go.kr/www/selectBbsNttList.do?key=${b.key}&bbsNo=${b.bbs}&pageIndex=${page}`;
const VIEW = (b: Board, ntt: string) =>
  `https://www.oc.go.kr/www/selectBbsNttView.do?key=${b.key}&bbsNo=${b.bbs}&nttNo=${ntt}`;

/** 고시공고(bbsNo=40)는 기존 형식 유지 — 나머지 게시판만 bbsNo 를 섞어 충돌을 막는다 */
const externalId = (b: Board, ntt: string) =>
  b.bbs === 40 ? `oc-notice-${ntt}` : `oc-notice-${b.bbs}-${ntt}`;

interface Notice {
  ntt: string;
  title: string;
  dept: string;
  notno: string;
  date: string;
  board: Board;
  /** 채용공고 목록의 '마감일' 칸("YYYY-MM-DD") — 다른 게시판·빈 칸은 null */
  listDeadline: string | null;
  /** 채용공고 목록의 '접수시작일' 칸 — 근거 구간 문구를 만들 때만 쓴다 */
  listStart: string | null;
}

/** 상세 본문에서 뽑은 기간 정보(본문 추출 성공 건만 만들어진다) */
interface Period {
  /** 마감일 "YYYY-MM-DD" — 못 찾으면 null */
  deadline: string | null;
  /** 근거가 된 원문 구간(예: "모집 기간: 2026. 9. 28.(월) ~ 10. 8.(목)") */
  period: string | null;
  /** 본문 텍스트 앞 2,000자(항상 비어 있지 않음) */
  body: string;
}

const STOP = new Set([
  "공고", "안내", "관련", "대한", "위한", "따른", "의한", "결과", "신청", "모집",
  "실시", "계획", "변경", "고시", "제출", "opening", "옥천", "옥천군",
]);

/** 제목에서 토픽 키워드 추출(검색·분류용, 최대 6개) */
function keywordsFromTitle(title: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of title.replace(/\[[^\]]*\]/g, " ").split(/[^0-9A-Za-z가-힣]+/)) {
    const t = raw.trim();
    if (t.length < 2 || t.length > 12 || STOP.has(t) || /^\d+$/.test(t)) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= 6) break;
  }
  return out;
}

function toIso(d: string): string | null {
  const m = d.match(/(20\d{2})[.\-](\d{1,2})[.\-](\d{1,2})/);
  if (!m) return null;
  const iso = `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}T09:00:00+09:00`;
  return Number.isNaN(Date.parse(iso)) ? null : new Date(iso).toISOString();
}

function stripTags(s: string): string {
  // 제목의 &#039; 같은 엔티티도 여기서 복원(목록·상세 공통)
  return decodeEntities(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

/** 본문에 흔한 HTML 엔티티만 복원(외부 라이브러리 없이) */
function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)));
}

/** 상세 HTML → 본문 텍스트(td.p-table__content 안). 없거나 비면 null(= 추출 실패) */
function extractBody(html: string): string | null {
  const m = html.match(/<td[^>]*class="[^"]*p-table__content[^"]*"[^>]*>([\s\S]*?)<\/td>/);
  if (!m) return null;
  const text = stripTags(decodeEntities(m[1].replace(/<br\s*\/?>/gi, " ")));
  return text || null;
}

/* ── 기간 파싱 ─────────────────────────────────────────────────────────── */

/** 날짜 한 개 — 연도는 선택. "2026년 9월 22일" / "2026. 9. 22." / "2026-09-22" / "9월 22일" / "10. 8.(목)" */
// 앞뒤 숫자 경계(공고번호 "제2026-1285호" 같은 것이 날짜로 읽히지 않게)
const DATE_RE =
  /(?<!\d)(?:(20\d{2})\s*[.년\-\/]\s*)?(\d{1,2})\s*[.월\-\/]\s*(\d{1,2})(?!\d)\s*(?:일|\.)?\s*(?:\([월화수목금토일]\))?/g;

/** 기간 라벨 — 주민 기준 마감이 앞서도록 우선순위 순(뒤쪽은 행정예고·고시의 게재/공개 창) */
const PERIOD_LABELS = ["신청", "접수", "모집", "의견\\s*제출", "공람", "열람", "공고", "예고", "게재", "공개", "적용"];
/** 라벨과 첫 날짜 사이 허용 거리(문자) — "공고기간 내에 권리를 행사…" 같은 서술문을 기간으로 읽지 않게 */
const LABEL_DATE_GAP = 16;
/** 범위 구분자(~·-·부터) 뒤 종료 날짜까지 허용 거리(문자) — "(월) ~ " 정도만 */
const RANGE_END_GAP = 6;
/** 종료일이 정해지지 않은 표현 — 있으면 마감 없음(null) */
const OPEN_ENDED_RE = /별도\s*공지|별도\s*안내|상시|계속|소진\s*시|소진시|채용\s*시|채용시|완료\s*시|완료시/;
/** 범위 구분자 — "-" 는 날짜 토큰이 끝난 뒤에만 구분자로 본다(날짜 안의 "-" 와 구별). 시각("10:00")은 건너뛴다 */
const RANGE_SEP_RE = /^\s*(?:\d{1,2}\s*:\s*\d{2}\s*)?(?:부터\s*[~∼～\-–—]?|[~∼～\-–—])/;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** 달력상 존재하는 날짜인지 */
function validYmd(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

interface ParsedDate { y: number | null; m: number; d: number; index: number; text: string }

/** 구간 문자열에서 날짜 토큰을 순서대로 뽑는다 */
function findDates(seg: string): ParsedDate[] {
  const out: ParsedDate[] = [];
  DATE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = DATE_RE.exec(seg))) {
    const mo = Number(m[2]);
    const da = Number(m[3]);
    if (mo < 1 || mo > 12 || da < 1 || da > 31) continue;
    out.push({ y: m[1] ? Number(m[1]) : null, m: mo, d: da, index: m.index, text: m[0] });
  }
  return out;
}

/**
 * 종료 날짜의 연도를 정한다. 시작 연도를 start.y ?? postYear 로 먼저 확정하고,
 * 종료에 연도가 없으면 시작 연도를 물려받되 월·일이 시작보다 앞서면(연말→연초) +1.
 * 달력에 없는 날짜(2월 30일 등)면 null.
 */
function resolveEnd(end: ParsedDate, start: ParsedDate | null, postYear: number): string | null {
  const startY = start?.y ?? postYear;
  let y = end.y ?? startY;
  if (!end.y && start && (end.m < start.m || (end.m === start.m && end.d < start.d))) y = startY + 1;
  if (!validYmd(y, end.m, end.d)) return null;
  return `${y}-${pad2(end.m)}-${pad2(end.d)}`;
}

type Picked = { iso: string; span: string } | null | "open";

/**
 * 라벨 뒤 구간("<라벨>기간:" 다음)에서 종료 날짜를 고른다.
 *   · "시작 ~ 끝" / "시작부터 끝까지" / "시작 - 끝" — 구분자 뒤 종료 날짜가 반드시 있어야 한다
 *   · "끝까지" / "~ 끝까지" — 단일 날짜는 "까지"가 직접 붙은 경우만
 *   · "부터 별도 공지 시까지" 같은 열린 기간은 "open"(마감 없음)
 *   · 그 밖의 단일 날짜(예: "공고기간: 2026. 9. 1.")는 null
 */
function pickLabelEnd(seg: string, postYear: number): Picked {
  const dates = findDates(seg);
  if (dates.length === 0 || dates[0].index > LABEL_DATE_GAP) return null;
  const first = dates[0];
  const firstEnd = first.index + first.text.length;
  const rest = seg.slice(firstEnd);
  const done = (end: ParsedDate, start: ParsedDate | null): Picked => {
    const iso = resolveEnd(end, start, postYear);
    return iso ? { iso, span: seg.slice(0, end.index + end.text.length).trim() } : null;
  };
  // 단일 날짜 + "까지" 직접 결합("9월 22일까지", "~ 9월 22일까지")
  if (/^\s*까지/.test(rest) || /[~∼～]\s*$/.test(seg.slice(0, first.index))) return done(first, null);
  const sep = rest.match(RANGE_SEP_RE);
  if (!sep) return null;
  const afterSep = firstEnd + sep[0].length;
  const end = dates.find((d) => d.index >= afterSep) ?? null;
  const between = seg.slice(afterSep, end ? end.index : afterSep + 30);
  if (OPEN_ENDED_RE.test(between)) return "open";
  if (!end || end.index - afterSep > RANGE_END_GAP) return null;
  return done(end, first);
}

/**
 * 본문에서 기간을 파싱한다. 게시일 기준 -60일 ~ +400일 밖의 값은 오탐으로 버린다.
 * @param postIso 게시일 ISO(연도 보정·범위 검사용)
 */
function parsePeriod(text: string, postIso: string): { deadline: string | null; period: string | null } {
  const postYear = Number(postIso.slice(0, 4));
  const postMs = Date.parse(postIso);
  const inRange = (iso: string) => {
    const ms = Date.parse(`${iso}T00:00:00+09:00`);
    return ms >= postMs - 60 * 864e5 && ms <= postMs + 400 * 864e5;
  };
  const none = { deadline: null, period: null };
  const t = text.replace(/\s+/g, " ");

  // 1) "<라벨>기간 : 시작 ~ 끝" — 라벨 우선순위대로. 열린 기간("별도 공지 시까지")이면 마감 없음으로 확정
  for (const label of PERIOD_LABELS) {
    const re = new RegExp(`(${label})\\s*기\\s*간\\s*[:：]?\\s*`, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(t))) {
      const seg = t.slice(m.index, m.index + 90);
      const picked = pickLabelEnd(seg.slice(m[0].length), postYear);
      if (picked === "open") return none;
      if (picked && inRange(picked.iso)) {
        return { deadline: picked.iso, period: (m[0] + picked.span).replace(/\s+/g, " ").trim() };
      }
    }
  }

  // 2) "~ <끝>까지" → 3) "<끝>까지" → 4) "마감(일) : <끝>" — 라벨 없는 폴백(순서 = 신뢰도).
  //    셋 다 날짜에 "까지"/"마감" 이 직접 붙어 있어 단일 날짜라도 마감으로 인정한다.
  const DATE_SRC = "(?:20\\d{2}\\s*[.년\\-\\/]\\s*)?\\d{1,2}\\s*[.월\\-\\/]\\s*\\d{1,2}\\s*(?:일|\\.)?\\s*(?:\\([월화수목금토일]\\))?";
  const fallbacks: RegExp[] = [
    new RegExp(`[~∼～]\\s*${DATE_SRC}\\s*까지`, "g"),
    new RegExp(`(?<!\\d)${DATE_SRC}\\s*까지`, "g"),
    new RegExp(`마감\\s*일?\\s*[:：(]?\\s*${DATE_SRC}`, "g"),
  ];
  for (const [fi, re2] of fallbacks.entries()) {
    let m2: RegExpExecArray | null;
    while ((m2 = re2.exec(t))) {
      const from = Math.max(0, m2.index - 40);
      const seg = t.slice(from, m2.index + m2[0].length);
      const dates = findDates(seg);
      // 매치 안의 날짜가 종료일, 그 앞 40자 안의 마지막 날짜가 시작일(연도 추정용)
      const end = dates.find((d) => d.index >= m2!.index - from) ?? null;
      if (!end) continue;
      const start = [...dates].reverse().find((d) => d.index < end.index) ?? null;
      const iso = resolveEnd(end, start, postYear);
      if (iso && inRange(iso)) {
        // 앞 40자는 시작일 문맥용(폴백 1). 나머지 폴백은 직전 문장부호 뒤부터만 근거 구간으로
        const lead = seg.slice(0, m2.index - from);
        const cut = fi === 0 ? 0 : Math.max(-1, ...[...lead.matchAll(/[.※,;:()]/g)].map((x) => x.index ?? -1)) + 1;
        return { deadline: iso, period: seg.slice(cut).trim() };
      }
    }
  }
  return none;
}

/* ── 파서 자가 테스트(--selftest) ───────────────────────────────────────── */

function selftest(): number {
  const cases: { name: string; text: string; post: string; want: string | null }[] = [
    { name: "정상 범위", text: "모집 기간: 2026. 9. 28.(월) ~ 10. 8.(목) 장소: 군청", post: "2026-09-07T00:00:00.000Z", want: "2026-10-08" },
    { name: "단일 날짜+부터~별도 공지", text: "신청기간: 2026. 9. 10.부터 별도 공지 시까지 ※ 2026. 10. 1. 시행", post: "2026-09-07T00:00:00.000Z", want: null },
    { name: "연말→연초(연도 없음)", text: "신청기간: 12월 20일 ~ 1월 10일", post: "2026-12-05T00:00:00.000Z", want: "2027-01-10" },
    { name: "'9월 22일까지'(라벨 없음)", text: "제출은 9월 22일까지 담당부서 방문", post: "2026-09-07T00:00:00.000Z", want: "2026-09-22" },
    { name: "'접수기간: 9월 22일까지'(라벨+까지)", text: "접수기간: 9월 22일까지", post: "2026-09-07T00:00:00.000Z", want: "2026-09-22" },
    { name: "'마감일: 2026.9.30'", text: "마감일: 2026.9.30 18:00", post: "2026-09-07T00:00:00.000Z", want: "2026-09-30" },
    { name: "부터~까지 범위", text: "신청기간: 2026년 9월 10일부터 2026년 9월 30일까지", post: "2026-09-07T00:00:00.000Z", want: "2026-09-30" },
    { name: "하이픈 범위", text: "접수기간: 2026.9.1(월) - 2026.9.19(금)", post: "2026-09-07T00:00:00.000Z", want: "2026-09-19" },
    { name: "라벨+단일 날짜(까지 없음)", text: "공고기간: 2026. 9. 1. 담당: 행정과", post: "2026-09-07T00:00:00.000Z", want: null },
    { name: "상시 모집", text: "모집기간: 상시 모집", post: "2026-09-07T00:00:00.000Z", want: null },
    { name: "시작일 뒤 시각", text: "적용기간) 2026. 9. 3. 10:00 ~ 9. 4.", post: "2026-09-03T00:00:00.000Z", want: "2026-09-04" },
    { name: "공고번호 오탐 방지", text: "옥천군 공고 제2026-1285호 공고기간 내에 권리를 행사", post: "2026-09-07T00:00:00.000Z", want: null },
  ];
  let fail = 0;
  for (const c of cases) {
    const got = parsePeriod(c.text, c.post);
    const ok = got.deadline === c.want;
    if (!ok) fail++;
    console.log(`${ok ? "PASS" : "FAIL"} ${c.name}: got ${got.deadline} (want ${c.want})${got.period ? ` — "${got.period}"` : ""}`);
  }
  console.log(`\n${cases.length - fail}/${cases.length} 통과`);
  return fail;
}

/** 상세 페이지 1건 — 본문·기간. fetch 실패·본문 추출 실패 모두 null(= 실패, 기존 값 보존) */
async function fetchDetail(n: Notice): Promise<Period | null> {
  try {
    const res = await fetch(VIEW(n.board, n.ntt), { headers: { "User-Agent": UA } });
    if (!res.ok) return null;
    const body = extractBody(await res.text());
    // 200 이어도 유지보수 페이지·마크업 변경으로 본문이 없으면 실패로 본다
    if (!body) return null;
    const { deadline, period } = parsePeriod(body, n.date);
    return { deadline, period, body: body.slice(0, 2000) };
  } catch {
    return null;
  }
}

/** "YYYY-MM-DD" 칸만 통과시킨다(채용공고의 접수시작일·마감일 칸은 비어 있을 수 있다) */
function ymdCell(s: string | undefined): string | null {
  const t = (s ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
}

/** 목록 HTML → 공고 행 파싱. 네 게시판 모두 td 순서가 같아 board 만 갈아 끼운다 */
function parseList(html: string, board: Board): Notice[] {
  const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) ?? [];
  const out: Notice[] = [];
  for (const r of rows) {
    if (!r.includes("p-subject")) continue;
    const nttM = r.match(/nttNo=(\d+)/);
    if (!nttM) continue;
    const tds = [...r.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]);
    if (tds.length < 5) continue;
    // 번호(고시공고는 공고번호) | 제목 | 담당부서 | 공고일 | 조회 | 파일 [| 접수시작일 | 마감일]
    const notno = stripTags(tds[0]);
    const title = stripTags(tds[1]).replace(/새글|새 글/g, "").trim();
    const dept = stripTags(tds[2]);
    const date = stripTags(tds[3]);
    if (!title) continue;
    // 채용공고(td 8개)만 뒤 두 칸이 접수시작일·마감일
    const listStart = tds.length >= 8 ? ymdCell(stripTags(tds[6])) : null;
    const listDeadline = tds.length >= 8 ? ymdCell(stripTags(tds[7])) : null;
    out.push({ ntt: nttM[1], title, dept, notno, date, board, listStart, listDeadline });
  }
  return out;
}

/** 기존 raw 중 병합에 쓰는 필드 */
interface PrevRaw { deadline?: string | null; period?: string | null; [k: string]: unknown }

async function main(): Promise<void> {
  const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith("--")));
  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (flags.has("--selftest")) {
    process.exit(selftest() === 0 ? 0 : 1);
  }
  // --reparse: 본문 추출에 성공한 건은 파서 결과(null 포함)로 기존 deadline/period 를 덮는다
  const reparse = flags.has("--reparse");

  loadEnv();
  const lookbackDays = Number(args[0] || "60");
  const maxPages = Number(args[1] || "20");
  const cutoff = Date.now() - lookbackDays * 864e5;

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  // 게시판 4종을 차례로 — 키는 external_id(게시판마다 nttNo 가 겹칠 가능성 차단)
  const collected = new Map<string, Notice>();
  for (const board of BOARDS) {
    let boardAdded = 0;
    for (let pg = 1; pg <= maxPages; pg++) {
      const res = await fetch(LIST(board, pg), { headers: { "User-Agent": UA } });
      if (!res.ok) throw new Error(`${board.label} 목록 로드 실패 p${pg}: ${res.status}`);
      const notices = parseList(await res.text(), board);
      let added = 0;
      let pageMin = Date.now();
      for (const n of notices) {
        const iso = toIso(n.date);
        if (!iso) continue;
        pageMin = Math.min(pageMin, Date.parse(iso));
        const id = externalId(board, n.ntt);
        if (!collected.has(id)) {
          collected.set(id, { ...n, date: iso });
          added++;
          boardAdded++;
        }
      }
      console.log(
        `${board.label} p${pg}: +${added} (게시판 ${boardAdded}), 최소공고일 ${new Date(pageMin).toISOString().slice(0, 10)}`,
      );
      if (added === 0 && pg > 1) break;
      if (pageMin < cutoff) { console.log(`  → ${lookbackDays}일 경계 도달`); break; }
      await new Promise((r) => setTimeout(r, 400));
    }
  }

  const posts = [...collected.values()].filter((p) => Date.parse(p.date) >= cutoff);
  const perBoard = (list: Notice[]) =>
    BOARDS.map((b) => `${b.label} ${list.filter((p) => p.board.bbs === b.bbs).length}`).join(" · ");
  console.log(`\n적재 대상: ${posts.length}건 (${lookbackDays}일 이내) — ${perBoard(posts)}`);
  if (posts.length === 0) return;

  // 상세 순회 — 400ms 간격(군청 서버 배려). 실패 건(fetch·본문 추출)은 목록 정보만.
  const details = new Map<string, Period>();
  let detailFail = 0;
  let parsed = 0;
  for (let i = 0; i < posts.length; i++) {
    const p = posts[i];
    const d = await fetchDetail(p);
    if (!d) detailFail++;
    else {
      details.set(externalId(p.board, p.ntt), d);
      if (d.deadline) parsed++;
    }
    if ((i + 1) % 20 === 0 || i === posts.length - 1) {
      console.log(`  상세 ${i + 1}/${posts.length} — 마감 파싱 ${parsed}건, 실패 ${detailFail}건`);
    }
    if (i < posts.length - 1) await new Promise((r) => setTimeout(r, 400));
  }
  const fetched = posts.length - detailFail;
  console.log(
    `상세 수신 ${fetched}/${posts.length}건, 마감 파싱 ${parsed}건` +
      (fetched ? ` (${Math.round((parsed / fetched) * 100)}%)` : ""),
  );

  // 이전 실행의 raw 를 전부 읽어 병합한다(실패 건 보존 + 성공 건도 검증된 필드만 갱신).
  // 조회가 실패하면 기존 값을 덮어쓸 위험이 있으므로 upsert 하지 않고 중단.
  const ids = posts.map((p) => externalId(p.board, p.ntt));
  const prevRaw = new Map<string, PrevRaw>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await sb
      .from("articles")
      .select("external_id, raw")
      .eq("source", "oc_gov")
      .in("external_id", ids.slice(i, i + 200));
    if (error) throw new Error(`기존 raw 조회 실패 — upsert 중단: ${error.message}`);
    for (const r of data ?? []) prevRaw.set(r.external_id as string, (r.raw ?? {}) as PrevRaw);
  }

  const baseRow = (p: Notice) => ({
    source: "oc_gov" as const,
    kind: "notice" as const,
    external_id: externalId(p.board, p.ntt),
    url: VIEW(p.board, p.ntt),
    title: p.title,
    category: p.board.label,
    keywords: keywordsFromTitle(p.title),
    published_at: p.date,
  });
  // PostgREST 일괄 upsert 는 행마다 같은 키여야 하므로 상세 유무로 두 묶음
  let kept = 0; // 파싱 null 이지만 기존 마감을 유지한 건
  let cleared = 0; // --reparse 로 기존 마감을 지운 건
  let fromList = 0; // 채용공고 목록의 마감일 칸을 그대로 쓴 건
  const withDetail = posts
    .filter((p) => details.has(externalId(p.board, p.ntt)))
    .map((p) => {
      const id = externalId(p.board, p.ntt);
      const d = details.get(id)!;
      const prev = prevRaw.get(id) ?? {};
      let deadline = d.deadline;
      let period = d.period;
      if (p.listDeadline) {
        // 채용공고 목록의 마감일 칸 — 구조화된 값이라 본문 파싱보다 신뢰도가 높다
        deadline = p.listDeadline;
        period = p.listStart ? `접수기간: ${p.listStart} ~ ${p.listDeadline}` : `마감일: ${p.listDeadline}`;
        fromList++;
      } else if (!d.deadline && prev.deadline) {
        // 운영자가 --reparse 판단을 할 수 있게 어떤 건인지 남긴다
        console.log(`  ${reparse ? "지움" : "기존 유지"}: [${id}] ${p.title} — 기존 ${prev.deadline} (${prev.period ?? "-"})`);
        if (reparse) cleared++;
        else { kept++; deadline = prev.deadline; period = prev.period ?? null; }
      }
      return {
        ...baseRow(p),
        body: d.body,
        raw: { ...prev, notno: p.notno, dept: p.dept, board: p.board.slug, deadline, period },
      };
    });
  const withoutDetail = posts
    .filter((p) => !details.has(externalId(p.board, p.ntt)))
    .map((p) => {
      const prev = prevRaw.get(externalId(p.board, p.ntt)) ?? {};
      // 상세를 못 받아도 채용공고는 목록 마감일 칸만으로 마감을 채울 수 있다
      const listOnly = p.listDeadline
        ? {
            deadline: p.listDeadline,
            period: p.listStart ? `접수기간: ${p.listStart} ~ ${p.listDeadline}` : `마감일: ${p.listDeadline}`,
          }
        : {};
      if (p.listDeadline) fromList++;
      return { ...baseRow(p), raw: { ...prev, notno: p.notno, dept: p.dept, board: p.board.slug, ...listOnly } };
    });
  const BATCH = 200;
  let up = 0;
  for (const rows of [withDetail, withoutDetail]) {
    for (let i = 0; i < rows.length; i += BATCH) {
      const { error } = await sb.from("articles").upsert(rows.slice(i, i + BATCH), { onConflict: "source,external_id" });
      if (error) throw new Error(`upsert 실패: ${error.message}`);
      up += Math.min(BATCH, rows.length - i);
    }
  }
  const prevDeadlines = [...prevRaw.values()].filter((r) => r.deadline).length;
  const nowDeadlines = withDetail.filter((r) => r.raw.deadline).length
    + withoutDetail.filter((r) => r.raw.deadline).length;
  const ds = posts.map((p) => p.date).sort();
  console.log(`✅ articles(공고) upsert ${up}건 — ${ds[0].slice(0, 10)} ~ ${ds[ds.length - 1].slice(0, 10)}`);
  console.log(`   게시판별: ${perBoard(posts)}`);
  console.log(
    `   마감 있는 건: 이전 ${prevDeadlines} → 이번 ${nowDeadlines} (목록 마감일 칸 ${fromList}건, 기존 유지 ${kept}건` +
      (reparse ? `, --reparse 로 지움 ${cleared}건` : "") +
      `, 실패로 목록만 갱신 ${withoutDetail.length}건)`,
  );
}

main().catch((e) => { console.error(e); process.exit(1); });
