// ============================================================================
// /notices — 옥천군청 공고 목록 (Server Component) — 「관보」 조판, 마감 중심
//
// articles(source='oc_gov', kind='notice', category=게시판 한글명 4종)를 **마감일 중심**으로
// 재구성해 렌더한다. 마감일은 스크래퍼(scripts/scrape/scrape-oc-notices.ts)가 상세 본문(또는
// 채용공고 목록의 마감일 칸)에서 뽑아 raw.deadline("YYYY-MM-DD")·raw.period(근거 구간)에
// 넣은 값이다. 하단 네비 '공고' 탭의 목적지.
//
// 회의 결정 [4·5, 공고 날짜 구분] 반영
//   · 게시판 버튼 5개(전체·공지사항·고시공고·입법예고·채용공고) — ?board= 쿼리.
//     1px 잉크 테두리, 활성은 반전(잉크 바탕·종이 글자), 탭 타깃 44px.
//     서버에서 쿼리를 읽어 그리므로 클라이언트 JS 0.
//   · **마감 지난 공고는 목록에서 아예 숨긴다**(예전 ④ '마감 지남' 접힘 섹션 삭제).
//     쿼리 단계에서 raw.deadline ≥ 오늘 로 걸러 서버로 올라오지도 않는다.
//     단 기간이 없는 공고는 마감 개념이 없으므로 게시일 순으로 그대로 남는다.
//   · 날짜는 라벨로 구분한다 — 좌 셀의 "게시 9월"(게시일)과 "마감 9/8(화)"(마감일).
//     게시일이 마감처럼 읽히던 지적을 라벨로 끊는다(행 메타의 "게시 9/5" 되풀이는 도면 #8로 삭제).
//   · 한 화면 3건 — 상단 마감 밴드가 임박 3건을 먼저 보여 준다(전체 보기에서만.
//     게시판을 고른 화면은 밴드가 다른 게시판 건을 섞어 보이므로 접고, ① 섹션이 그 자리).
//
// 구성(위→아래). 날짜 계산은 전부 KST 기준 서버에서만(클라이언트 new Date 없음).
//   ① 마감 임박 — 오늘 ≤ 마감 ≤ 오늘+7, D-n 오름차순. 당일은 "오늘 마감"(주황 강조).
//   ② 진행 중   — 마감 > 오늘+7, 마감 오름차순.
//   ③ 기간 없는 공고 — 마감 파싱 안 된 공고, 게시일 내림차순(기존 관보 문법 그대로).
//   좌 72px 셀: ①②는 D-day 셀("7" 40px + "일 남음" / "오늘 마감") + "마감 9/8(화)",
//   ③은 날짜 셀("게시 9월" 위 · 일 큰 숫자). 같은 셀 값끼리 1px 괘선, 묶음 사이 2px.
//   데스크탑 다단(column-count)에서 묶음(.nt-group)은 break-inside: avoid — 섹션별 목록.
//   빈/에러 상태는 점선 괘선 블록 텍스트. 카드 없음. 스타일: app/notices.css
//
// 도면 반영(피그마 코멘트 2026-09-11)
//   · #3  D-day 셀은 **3일 이내면 주황 강조**(오늘 마감과 같은 강조, 4일 이상은 잉크색).
//   · #8  행 메타에서 **게시자(부서명)와 "게시 9/5" 삭제** — 제목 아래는 원문 기간 구간
//         한 줄 + "원문 ↗"만. 날짜는 이미 좌 셀에 큰 숫자로 있어 메타에서 되풀이하지 않는다
//         (게시일 <time> 은 스크린리더·크롤러용으로 sr-only 로 남긴다).
//   · #10 제호 보조 설명은 한 마디 — "독자를 위한 공고".
// ============================================================================

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  getDeadlineItems,
  NOTICE_BOARDS,
  NOTICE_CATEGORIES,
  type NoticeBoardSlug,
} from "@/components/home/action-layer";
import { DeadlineBoard } from "@/components/home/deadline-board";
import "@/app/notices.css";
import { region } from "@/config/region";

export const dynamic = "force-dynamic";

/** 기간 없는 공고(③) 최대 건수 */
const PAGE_SIZE = 30;
/** 마감 있는 공고(①②) 최대 조회 건수 */
const DEADLINE_ROWS = 120;
/** 마감 밴드에 올릴 최대 건수(홈 BOARD_LIMITS.deadlines 와 동일 — "한 화면 3건") */
const DEADLINE_LIMIT = 3;
/** "마감 임박" 창 — 오늘부터 이 일수 안 */
const SOON_DAYS = 7;

interface Notice {
  id: string;
  title: string;
  url: string | null;
  publishedAt: string | null;
  /** "YYYY-MM-DD"(KST) — 스크래퍼가 뽑은 마감. 없으면 null */
  deadline: string | null;
  /** 근거 원문 구간(예: "모집 기간: 2026. 9. 28. ~ 10. 8.") */
  period: string | null;
  /** 오늘(KST) 기준 남은 일수 — deadline 없으면 null */
  daysLeft: number | null;
}

/** 좌 셀 하나로 묶인 공고 묶음 */
interface NoticeGroup {
  /** 묶음 키 — 마감 섹션은 마감일, 날짜 섹션은 게시일 "YYYY-MM-DD". 날짜 없는 공고는 "" */
  key: string;
  items: Notice[];
}

/* ── 게시판 필터 ─────────────────────────────────────────────────────── */

/** ?board= 값 → 게시판 한글명. 알 수 없는 값은 '전체'로 떨어뜨린다(404 대신 관대하게) */
function boardLabel(slug: string | undefined): string | null {
  const hit = NOTICE_BOARDS.find((b) => b.slug === slug);
  return hit ? hit.label : null;
}

/** 게시판 버튼 한 개의 목적지 — 전체는 쿼리 없는 /notices */
function boardHref(slug: NoticeBoardSlug | null): string {
  return slug ? `/notices?board=${slug}` : "/notices";
}

/** KST 달력 날짜 "YYYY-MM-DD" — 서버 타임존과 무관하게 결정론적 */
const KST_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" });
const KST_WEEKDAY = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", weekday: "short" });

function dayKey(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : KST_DAY.format(d);
}

/** "YYYY-MM-DD" 두 날짜의 일수 차(b − a) — 달력 날짜 문자열끼리라 타임존 영향 없음 */
function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** 마감일 짧은 표기 "9/22(화)" — 요일만 KST 고정 Intl */
function shortDeadline(day: string): string {
  const [, m, d] = day.split("-");
  const weekday = KST_WEEKDAY.format(new Date(`${day}T00:00:00+09:00`));
  return `${Number(m)}/${Number(d)}(${weekday})`;
}

/** 정렬된 목록을 연속된 같은 키끼리 묶는다(정렬은 유지) */
function groupBy(items: Notice[], keyOf: (n: Notice) => string): NoticeGroup[] {
  const groups: NoticeGroup[] = [];
  for (const n of items) {
    const key = keyOf(n);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(n);
    else groups.push({ key, items: [n] });
  }
  return groups;
}

type Row = { id: string; title: string; url: string | null; published_at: string | null; raw: unknown };

function toNotice(r: Row, today: string): Notice {
  // raw.dept(담당 부서)는 도면 #8로 화면에서 빠져 더 읽지 않는다
  const raw = (r.raw ?? {}) as { deadline?: string | null; period?: string | null };
  const deadline = raw.deadline && /^\d{4}-\d{2}-\d{2}$/.test(raw.deadline) ? raw.deadline : null;
  return {
    id: r.id,
    title: r.title,
    url: r.url ?? null,
    publishedAt: r.published_at ?? null,
    deadline,
    period: raw.period ?? null,
    daysLeft: deadline ? daysBetween(today, deadline) : null,
  };
}

interface Sections {
  /** ① 오늘 ≤ 마감 ≤ 오늘+7 */
  soon: Notice[];
  /** ② 마감 > 오늘+7 */
  open: Notice[];
  /** ③ 마감 없음 — 게시일 내림차순 */
  undated: Notice[];
}

/**
 * 공고를 두 갈래로 읽는다 — 마감 있는 건(오늘 이후만) · 마감 없는 건.
 * @param today "YYYY-MM-DD"(KST)
 * @param label 게시판 한글명. null 이면 4종 전부
 */
async function loadNotices(
  today: string,
  label: string | null,
): Promise<{ sections: Sections; error: boolean }> {
  const empty: Sections = { soon: [], open: [], undated: [] };
  try {
    const supabase = await createClient();
    // source='oc_gov' and kind='notice' 는 부분 인덱스 articles_oc_notice_deadline_idx(0018)의
    // 조건과 같아야 raw->>deadline 필터·정렬이 인덱스를 탄다 — 바꾸면 인덱스도 함께.
    // 게시판 선택은 그 위에 category IN 으로 얹는다.
    const base = () =>
      supabase
        .from("articles")
        .select("id, title, url, published_at, raw")
        .eq("source", "oc_gov")
        .eq("kind", "notice")
        .in("category", label ? [label] : NOTICE_CATEGORIES);
    // raw->>deadline 은 "YYYY-MM-DD" 텍스트 — 문자열 비교가 날짜 순과 같다.
    // 마감 지난 공고는 여기서 잘라 낸다(회의 결정: 목록에서 아예 숨김).
    const [dated, undated] = await Promise.all([
      base()
        .gte("raw->>deadline", today)
        .order("raw->>deadline", { ascending: true })
        .order("published_at", { ascending: false })
        .limit(DEADLINE_ROWS),
      base().is("raw->>deadline", null).order("published_at", { ascending: false }).limit(PAGE_SIZE),
    ]);
    if (dated.error) throw dated.error;
    if (undated.error) throw undated.error;

    const sections: Sections = { soon: [], open: [], undated: [] };
    for (const r of (dated.data ?? []) as Row[]) {
      const n = toNotice(r, today);
      // 쿼리에서 이미 걸렀지만, 값이 깨진 행이 섞여도 지난 건은 넣지 않는다
      if (n.daysLeft === null || n.daysLeft < 0) continue;
      if (n.daysLeft <= SOON_DAYS) sections.soon.push(n);
      else sections.open.push(n);
    }
    sections.undated = ((undated.data ?? []) as Row[]).map((r) => toNotice(r, today));
    return { sections, error: false };
  } catch (e) {
    console.error("[/notices] 조회 실패:", e);
    return { sections: empty, error: true };
  }
}

/* ── 좌 72px 셀 ──────────────────────────────────────────────────────── */

/**
 * 날짜 셀 — '일' 40px 800 + "게시 N월"(해가 다르면 연도 병기). ③ 기간 없는 공고용.
 * 머리에 "게시"를 붙여 마감일과 헷갈리지 않게 한다(회의 결정: 날짜 구분).
 */
function DayCell({ dayKey: key, thisYear }: { dayKey: string; thisYear: string }) {
  if (!key) {
    return (
      <div className="nt-day">
        <span className="nt-day-n" aria-hidden="true">
          —
        </span>
        <span className="nt-day-m">날짜 미상</span>
      </div>
    );
  }
  const [y, m, d] = key.split("-");
  const month = `${Number(m)}월`;
  return (
    <div className="nt-day">
      <time dateTime={key} aria-label={`${y}년 ${Number(m)}월 ${Number(d)}일 게시`}>
        <span className="nt-day-m" aria-hidden="true">
          {y !== thisYear ? `게시 ${y}. ${month}` : `게시 ${month}`}
        </span>
        <span className="nt-day-n" aria-hidden="true">
          {Number(d)}
          <small className="nt-day-u">일</small>
        </span>
      </time>
    </div>
  );
}

/**
 * D-day 셀 — 40px 숫자 문법. 남은 일수 n:
 *   n > 0 → "n" 40px + "일 남음" · n = 0 → "오늘" 40px + "마감"(주황)
 * 마감일 자체는 셀 아래 13px "마감 9/22(화)" — '마감' 라벨을 붙여 게시일과 구분한다.
 * 지난 공고는 목록에 오지 않으므로 음수 분기는 없다.
 * 도면 #3: 남은 3일 이내(0~3일)면 숫자·낱말을 주황(--warning)으로 — '오늘 마감'과 같은 강조.
 * 4일 이상은 잉크색 그대로 두어 강조가 임박한 건에만 남는다.
 */
function DdayCell({ deadline, daysLeft }: { deadline: string; daysLeft: number }) {
  const label = daysLeft === 0 ? "오늘 마감" : `${daysLeft}일 남음`;
  const urgent = daysLeft <= 3; // 3일 이내 = 색 강조
  return (
    <div
      className={`nt-day nt-dday${urgent ? " nt-dday--urgent" : ""}${daysLeft === 0 ? " nt-dday--today" : ""}`}
    >
      <time dateTime={deadline} aria-label={`${label}, ${shortDeadline(deadline)} 마감`}>
        {daysLeft === 0 ? (
          <>
            <span className="nt-day-n nt-day-n--word" aria-hidden="true">
              오늘
            </span>
            <span className="nt-day-m nt-dday-u" aria-hidden="true">
              마감
            </span>
          </>
        ) : (
          <>
            {/* 세 자리(100일 이상)는 72px 셀에 맞게 한 단계 작게 */}
            <span className={`nt-day-n${daysLeft >= 100 ? " nt-day-n--3" : ""}`} aria-hidden="true">
              {daysLeft}
              <small className="nt-day-u">일</small>
            </span>
            <span className="nt-day-m nt-dday-u" aria-hidden="true">
              남음
            </span>
          </>
        )}
        {/* 날짜만 — "마감" 낱말은 뺐다(검토 2026-09-21). 셀 위 "N일 남음"이 이미 마감을 말한다 */}
        <span className="nt-day-m nt-dday-d" aria-hidden="true">
          {shortDeadline(deadline)}
        </span>
      </time>
    </div>
  );
}

/* ── 행·목록 ─────────────────────────────────────────────────────────── */

/**
 * 공고 한 줄 — 제목 전문 + 메타 한 줄.
 * 도면 #8: 메타는 원문 기간 구간("2026. 9. 5. ~ 2026. 9. 28.") + "원문 ↗"만.
 * 게시자(부서명)와 "게시 9/5"는 지웠다 — 부서는 독자의 판단에 쓰이지 않고, 날짜는
 * 좌 셀(마감 D-day / 게시 N월)에 이미 큰 숫자로 있다. 게시일은 sr-only <time> 으로만 남긴다.
 */
function NoticeRow({ n }: { n: Notice }) {
  const Row = n.url ? "a" : "div";
  const posted = dayKey(n.publishedAt);
  return (
    <li className="nt-row">
      <Row
        {...(n.url ? { href: n.url, target: "_blank", rel: "noopener noreferrer nofollow" } : {})}
        className={n.url ? "nt-row-link" : "nt-row-body"}
      >
        {/* 제목 전문 — 줄임 없음 */}
        <h2 className="nt-title">{n.title}</h2>
        {n.period || n.url || posted ? (
          <p className="nt-meta">
            {n.period ? <span className="nt-period">{n.period}</span> : null}
            {n.url ? <span className="nt-src">원문 ↗</span> : null}
            {posted ? (
              <time dateTime={posted} className="sr-only">
                {posted}
              </time>
            ) : null}
          </p>
        ) : null}
      </Row>
    </li>
  );
}

/** 섹션 하나의 묶음 목록 — mode 가 좌 셀 종류(D-day/게시일)를 정한다 */
function NoticeList({
  groups,
  mode,
  thisYear,
  label,
}: {
  groups: NoticeGroup[];
  mode: "dday" | "day";
  thisYear: string;
  label: string;
}) {
  return (
    <ol className="nt-list" aria-label={label}>
      {groups.map((g, gi) => (
        <li key={g.key || `nodate-${gi}`} className="nt-group">
          {mode === "dday" && g.key ? (
            <DdayCell deadline={g.key} daysLeft={g.items[0].daysLeft ?? 0} />
          ) : (
            <DayCell dayKey={g.key} thisYear={thisYear} />
          )}
          <ul className="nt-rows">
            {g.items.map((n) => (
              <NoticeRow key={n.id} n={n} />
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}

/** 게시판 버튼 줄 — 전체 + 4종. 활성은 잉크 반전, 링크라 JS 없이 동작 */
function BoardTabs({ active }: { active: NoticeBoardSlug | null }) {
  const tabs: { slug: NoticeBoardSlug | null; label: string }[] = [
    { slug: null, label: "전체" },
    ...NOTICE_BOARDS,
  ];
  return (
    <nav className="nt-boards" aria-label="게시판 선택">
      {tabs.map((t) => {
        const on = t.slug === active;
        return (
          <Link
            key={t.slug ?? "all"}
            href={boardHref(t.slug)}
            className={on ? "nt-board is-on" : "nt-board"}
            aria-current={on ? "page" : undefined}
            prefetch={false}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

export default async function NoticesPage({
  searchParams,
}: {
  searchParams: Promise<{ board?: string }>;
}) {
  const { board } = await searchParams;
  const activeLabel = boardLabel(board);
  const active = activeLabel ? (board as NoticeBoardSlug) : null;

  const today = KST_DAY.format(new Date());
  const thisYear = today.slice(0, 4);
  const [{ sections, error }, deadlines] = await Promise.all([
    loadNotices(today, activeLabel),
    // 밴드는 게시판을 고르지 않은 '전체' 화면에서만 — 다른 게시판 건이 섞여 보이지 않게
    active ? Promise.resolve([]) : getDeadlineItems(DEADLINE_LIMIT),
  ]);
  const byDeadline = (n: Notice) => n.deadline ?? "";
  const soon = groupBy(sections.soon, byDeadline);
  const open = groupBy(sections.open, byDeadline);
  const undated = groupBy(sections.undated, (n) => dayKey(n.publishedAt));
  const total = sections.soon.length + sections.open.length + sections.undated.length;

  return (
    <div className="nt flex flex-col">
      {/* 마스트 — 찍힘(sticky·블러 없음) */}
      <header className="nt-mast">
        <h1 className="nt-mast-title">{region.place.name} 공고</h1>
        {/* 도면 #10 — 수집 경로·정렬 설명은 지우고 독자에게 하는 한 마디만 남긴다 */}
        <p className="nt-mast-meta">독자를 위한 공고</p>
      </header>

      <BoardTabs active={active} />

      {/* 마감 밴드 — 수기 deadline_items + 공고 raw.deadline(마감 ≥ 오늘) 있을 때만 주황 띠 */}
      <DeadlineBoard items={deadlines} />

      {error ? (
        <p className="nt-empty" role="alert">
          공고를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
        </p>
      ) : total === 0 ? (
        <p className="nt-empty">
          {activeLabel ? `${activeLabel}에 올라온 공고가 없습니다.` : "등록된 공고가 없습니다."}
        </p>
      ) : (
        <>
          {/* ① 마감 임박 — 7일 안 */}
          {soon.length > 0 ? (
            <section className="nt-sec nt-sec--soon" aria-labelledby="nt-h-soon">
              <h2 id="nt-h-soon" className="nt-sec-title">
                마감 임박 <span className="nt-sec-n">{sections.soon.length}건 · 7일 안</span>
              </h2>
              <NoticeList groups={soon} mode="dday" thisYear={thisYear} label="마감 임박 공고 · 마감 가까운 순" />
            </section>
          ) : null}

          {/* ② 진행 중 — 7일 넘게 남음 */}
          {open.length > 0 ? (
            <section className="nt-sec" aria-labelledby="nt-h-open">
              <h2 id="nt-h-open" className="nt-sec-title">
                진행 중 <span className="nt-sec-n">{sections.open.length}건 · 마감 가까운 순</span>
              </h2>
              <NoticeList groups={open} mode="dday" thisYear={thisYear} label="진행 중 공고 · 마감 가까운 순" />
            </section>
          ) : null}

          {/* ③ 기간 없는 공고 — 게시일 내림차순(관보 문법) */}
          {undated.length > 0 ? (
            <section className="nt-sec" aria-labelledby="nt-h-undated">
              <h2 id="nt-h-undated" className="nt-sec-title">
                기간 없는 공고 <span className="nt-sec-n">{sections.undated.length}건 · 게시일 최신순</span>
              </h2>
              <NoticeList groups={undated} mode="day" thisYear={thisYear} label="기간 없는 공고 · 게시일 최신순" />
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
