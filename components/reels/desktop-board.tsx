"use client";
// ============================================================================
// 데스크톱 전용 보드 — 「일점(一點) 지면」 홈 데스크탑 (기획안 (5) "홈 데스크탑").
//
// 좌 레일(SideNav, 셸) + 신문 2단.
//   좌 2/3 : 마스트("새로운 공론장이 펼쳐지도록" 40px + 날짜 + 오늘 첫 판)
//            → 크로스뷰 목록(번호 활자 01·02… | 헤드라인 28px ⋯/▬ 두 줄 | 썸네일 120px 점묘)
//            → 카드뉴스·공고·여론은 종이 단색 타일 4열(라운드 0, 텍스트만)
//   우 1/3 : sticky — 온도 TOP5(잉크 점 5개: 크기·적색 농도 = 온도, 낱말 앞·숫자 뒤)
//            / 오늘의 충북(회차 예고 + "▶ 듣기" 버튼 → 좌 레일 백색원 #side-play 가 재생)
//            / 마감 D-day 3건(있을 때) / 해결 크림면(있을 때)
// 시그니처: 행에 마우스를 올리면 잉크 점(24px)이 번호 왼쪽으로 미끄러져 그 행의 온도색으로
// 물든다 — CSS :hover 만(board.css .bd-row::before). JS 없음.
//
// [피그마 #6] 온도는 색으로도 읽힌다 — 크로스뷰 행 메타의 "매우 뜨거움 87°"와 우측 레일
// 목록의 "87° 매우 뜨거움"에 data-band(bandKey) 를 붙여 board.css 가 밴드별 활자 색(--t-ink)을
// 칠한다. 색이 붙는 건 온도 낱말+숫자뿐이고(사안명 제외), 빨강(수은)은 온도에만 쓴다.
//
// 데이터는 props 로 주입(실 Supabase 조회 결과). 로직·API·데이터 흐름은 1차와 동일.
// 마감·해결은 선택 props(fetch-board.ts HomeBoardData 의 deadlines/resolutions 와 같은 타입) —
// 홈(app/page.tsx)이 넘겨 주면 그리고, 없으면 섹션을 숨긴다(홈 불파괴).
// 스타일: app/board.css (reels.css 의 .board/.b-* 규칙은 건드리지 않고 더 구체적으로 덮는다)
// ============================================================================
import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";
import type { CrossviewPairWithArticles } from "@/lib/matching";
import type { TemperatureBoardItem } from "@/types";
import type { DeadlineItem, ResolutionStory } from "@/components/home/action-layer";
import {
  bandFor,
  crossviewTitle,
  tempForItem,
  fmtDate,
  fmtDateTime,
  type ReelsData,
} from "@/lib/reels/deck";
import { splitHeadline, ListenButton, teaserLines } from "./slides";
// 코멘트 #4: 팟캐 블록 제목 = 내용 요약 헤드라인 / 코멘트 #2: 날짜는 상대 표기
import { episodeDisplayHeadline } from "@/lib/podcast/script";
import { relativeKo, absoluteKo } from "@/lib/ui/relative-time";
import { MediaIcon } from "@/components/ui/media-icon";
import PairPhoto from "./pair-photo";
import { SiteFooter } from "@/components/site-footer";
import CardStory, { canStory } from "./card-story";

/** 보드 상단 카드 스토리 개수 — 3열 × 2줄 */
const BOARD_STORY_N = 6;
import "@/app/dot.css";
import "@/app/board.css";
import { region } from "@/config/region";

/** 오늘 날짜 — 표시용 "YYYY. MM. DD 요일" + <time dateTime> 용 로컬 ISO (표지와 동일 표기) */
function today(): { label: string; iso: string } {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const day = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"][d.getDay()];
  const iso = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  return { label: `${d.getFullYear()}. ${p(d.getMonth() + 1)}. ${p(d.getDate())} ${day}`, iso };
}

/**
 * 온도 밴드 → 잉크 점 색. 수은(#d90429→#ff6b5e)은 온도에만 쓴다.
 * 잠잠·매칭 없음 = 옅은 회색, 미온 = 잉크 제호, 보통 = 옅은 수은, 뜨거움 이상 = 수은.
 * (ink-dot.tsx / cover.css 의 data-band 매핑과 같은 눈금)
 */
function inkColorFor(band: string | null): string {
  switch (band) {
    case "미온":
      return "var(--accent)";
    case "보통":
      return "#ff6b5e";
    case "뜨거움":
    case "매우 뜨거움":
      return "#d90429";
    default:
      return "var(--faint)";
  }
}

/**
 * 밴드 라벨 → CSS data-band 키. 한글 라벨을 셀렉터에 쓰지 않기 위한 매핑으로
 * ink-dot.tsx / slides.tsx / cover.css 의 눈금과 같은 키를 쓴다.
 * [피그마 #6] 크로스뷰 행 메타의 온도 낱말·숫자와 우측 TEMPERATURE 레일의 낱말·숫자에
 * 붙여, board.css 가 밴드별 활자 색(--t-ink)을 칠한다. 색만 쓰지 않고 낱말도 같이 읽힌다.
 */
const BAND_KEY: Record<string, string> = {
  잠잠: "calm",
  미온: "mild",
  보통: "warm",
  뜨거움: "hot",
  "매우 뜨거움": "very-hot",
};

/** 밴드 라벨 → data-band 키(모르는 라벨은 "none" — 색을 칠하지 않는다) */
function bandKey(label: string | null | undefined): string {
  return (label && BAND_KEY[label]) || "none";
}

/** 마감 D-day 라벨 — 0일은 "오늘 마감" */
function ddayLabel(daysLeft: number): string {
  return daysLeft === 0 ? "오늘 마감" : `D-${daysLeft}`;
}

/** "YYYY-MM-DD" → [월, 일] — 문자열 파싱만(로컬 타임존에 따라 하루가 밀리는 getMonth/getDate 금지) */
function ymd(value: string): [number, number] | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return m ? [Number(m[2]), Number(m[3])] : null;
}

/** "7/22(수)" 짧은 마감일 표기(deadline-board 와 동일 규칙) — 요일만 KST 고정 Intl 로 */
function shortDeadline(deadline: string): string {
  const md = ymd(deadline);
  if (!md) return deadline;
  const weekday = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", weekday: "short" }).format(
    new Date(`${deadline.slice(0, 10)}T00:00:00+09:00`),
  );
  return `${md[0]}/${md[1]}(${weekday})`;
}

/** "6/12" 짧은 날짜 (null 이면 빈 문자열) */
function shortDate(value: string | null): string {
  if (!value) return "";
  const md = ymd(value);
  return md ? `${md[0]}/${md[1]}` : "";
}

/** 광역 ⋯ 도트 3개 / 기초 ▬ 괘선 토막 — 마커 색은 이 6px 도형에만(dot.css .mk) */
function Marker({ side }: { side: "macro" | "micro" }) {
  return side === "macro" ? (
    <span className="mk mk-macro" aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  ) : (
    <span className="mk mk-micro" aria-hidden="true">
      <i />
    </span>
  );
}

/** 섹션 머리 — 아이브로우 12px .14em + 괘선. 우측에 활자 링크(선택) */
function Eyebrow({
  children,
  href,
  more,
  id,
}: {
  children: React.ReactNode;
  href?: string;
  more?: string;
  id?: string;
}) {
  return (
    <div className="bd-eyebrow">
      <p className="b-eyebrow" id={id}>
        {children}
      </p>
      {href && more && (
        <Link className="bd-more" href={href}>
          {more} →
        </Link>
      )}
    </div>
  );
}

/**
 * 크로스뷰 헤드라인 28px — card_headline 을 첫 쉼표 기준 두 줄(1줄 광역 ⋯ / 2줄 기초 ▬, 같은 굵기).
 * 매체명은 스크린리더 전용 텍스트로 병기(색 의존 0). 쉼표가 없으면 한 줄, 없으면 crossviewTitle.
 */
function RowHeadline({ item }: { item: CrossviewPairWithArticles }) {
  const lines = splitHeadline(item.cardHeadline);
  if (lines.length < 2) {
    return (
      <h2 className="bd-head">
        <span className="bd-line plain">
          <span className="bd-text">{lines[0] || crossviewTitle(item)}</span>
        </span>
      </h2>
    );
  }
  return (
    <h2 className="bd-head">
      <span className="bd-line macro">
        <Marker side="macro" />
        <span className="bd-text">
          <span className="sr">{`${region.outlets.macro.tier} ${region.outlets.macro.name}: `}</span>
          {lines[0]}
        </span>
      </span>
      <span className="bd-line micro">
        <Marker side="micro" />
        <span className="bd-text">
          <span className="sr">{`${region.outlets.micro.tier} ${region.outlets.micro.name}: `}</span>
          {lines[1]}
        </span>
      </span>
    </h2>
  );
}

/** 크로스뷰 목록 행 — 번호 | 헤드라인 | 썸네일 120px. 행 전체가 링크. 온도색은 --row-ink 로 넘긴다 */
function CrossviewRow({
  item,
  index,
  temperature,
}: {
  item: CrossviewPairWithArticles;
  index: number;
  temperature: TemperatureBoardItem[];
}) {
  const match = tempForItem(item, temperature);
  const bandLabel = match ? match.band.label : null;
  const num = String(index + 1).padStart(2, "0");
  return (
    <li className="bd-row" style={{ "--row-ink": inkColorFor(bandLabel) } as CSSProperties}>
      <Link className="bd-row-link" href={`/crossview/${item.id}`}>
        <span className="bd-num" aria-hidden="true">
          {num}
        </span>
        <span className="bd-row-main">
          <RowHeadline item={item} />
          <span className="bd-row-meta">
            <span>{fmtDate(item.createdAt)}</span>
            {/* 출처 — 송신탑/종이신문 아이콘을 매체명 앞에 */}
            <span className="src-pair">
              <MediaIcon kind="broadcast" className="media-ic" />
              {region.outlets.macro.name}
              <span className="src-sep" aria-hidden="true">·</span>
              <MediaIcon kind="paper" className="media-ic" />
              {region.outlets.micro.name}
            </span>
            {/* 온도는 낱말이 앞, 숫자가 뒤. [피그마 #6] data-band 로 낱말+숫자만 밴드 색 */}
            {match && (
              <span className="bd-row-temp" data-band={bandKey(match.band.label)}>
                {/* 사안명은 밴드 색을 입히지 않는다 — 색은 온도 낱말+숫자에만 */}
                {match.row.issue?.label ? <span className="bd-row-issue">{match.row.issue.label} </span> : null}
                {match.band.label} <span className="bd-row-deg">{match.row.temperature}°</span>
              </span>
            )}
          </span>
        </span>
        {/* 썸네일 — 점묘 사진(뷰포트 진입 시 자동 해상). 없으면 빈 칸(정렬 유지).
            사진은 pairImage(옥천신문 원본 우선) — 원본을 쓰면 다른 화면과 같이 13px
            "사진 · 옥천신문" 출처를 사진 아래 한 줄로 붙인다(모바일 표지·덱과 동일 규칙).
            셀 높이만 auto 로 풀어 준다: 격자 열 폭 120px 과 align-items:start 는 그대로라
            출처 한 줄이 늘어나도 번호·헤드라인 열은 밀리지 않는다.
            행 자체가 이미 "MBC충북 · 옥천신문"을 읽어 주므로 셀은 계속 aria-hidden. */}
        <span className="bd-thumb-cell" style={{ height: "auto" }} aria-hidden="true">
          <PairPhoto
            pair={item}
            heightClass="bd-thumb"
            creditStyle={{ margin: "6px 0 0", width: 120 }}
          />
        </span>
      </Link>
    </li>
  );
}

/** 카드뉴스(card_data.slides) — 종이 단색 타일 4열, 텍스트만 */
export interface DesktopBoardProps {
  data: ReelsData;
  /** 마감 임박(오늘 이후) — fetch-board.ts HomeBoardData.deadlines. 없으면 섹션 숨김 */
  deadlines?: DeadlineItem[];
  /** 해결됐어요 — fetch-board.ts HomeBoardData.resolutions. 없으면 섹션 숨김 */
  resolutions?: ResolutionStory[];
}

export default function DesktopBoard({ data, deadlines = [], resolutions = [] }: DesktopBoardProps) {
  const { crossview, temperature, episodes, notices, forum, temperatureComputedAt } = data;
  const ep = episodes[0];
  // 이 보드는 폰에서도 CSS(only-desktop)로 숨긴 채 마운트된다 — 카드 스토리 6장의 효과·작성기까지 돌리지 않게
  // 하이드레이션 뒤 폰이면 스토리를 내리고 괘선 목록만 남긴다(SSR·첫 렌더는 데스크탑 기준이라 데스크탑엔 깜빡임 없음).
  const [isDesktop, setIsDesktop] = useState<boolean | null>(null);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1100px)");
    const apply = () => setIsDesktop(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  // 카드 스토리로 그릴 수 있는(card_data.slides ≥ 3) 상위 6쌍, 나머지는 괘선 목록(최대 12쌍)
  const stories = isDesktop === false ? [] : crossview.filter(canStory).slice(0, BOARD_STORY_N);
  const storyIds = new Set(stories.map((s) => s.id));
  const rest = crossview.filter((c) => !storyIds.has(c.id)).slice(0, 12 - stories.length);

  // 날짜는 클라 타임존으로 찍는다(서버 시각과의 하이드레이션 불일치 방지 — 표지와 동일)
  const [date, setDate] = useState<{ label: string; iso: string }>({ label: "", iso: "" });
  useEffect(() => {
    setDate(today());
  }, []);

  // 카드뉴스(card_data.slides ≥ 3장) — 목록 아래 타일로 최대 2건
  // 온도 TOP5 — 온도 내림차순(동률은 rank). 전부 0 이어도 순위로 보여 준다
  const top5 = [...temperature]
    .sort(
      (a, b) =>
        (Number(b.temperature) || 0) - (Number(a.temperature) || 0) ||
        (a.rank ?? 99) - (b.rank ?? 99),
    )
    .slice(0, 5);
  const allCalm = top5.every((t) => (Number(t.temperature) || 0) <= 0);
  const minutes = ep && ep.durationSec ? Math.max(1, Math.round(ep.durationSec / 60)) : null;
  // 팟캐 블록 표시 제목 — DB 의 날짜 제목(podDateTitle)은 sr-only 로만 남긴다(코멘트 #4)
  const podDateTitle = (ep?.title || "").trim();
  const podHeadline = ep ? episodeDisplayHeadline(ep) : "";

  return (
    <div className="board bd">
      <div className="bd-cols">
        {/* ── 좌 2/3 — 마스트 + 크로스뷰 목록 + 타일 ─────────────────────── */}
        <main className="bd-main">
          <header className="bd-mast">
            <h1 className="bd-mast-title">새로운 공론장이 펼쳐지도록</h1>
            <p className="bd-mast-date">
              <time dateTime={date.iso || undefined}>{date.label}</time>
              <span className="bd-mast-edition">오늘 첫 판</span>
            </p>
          </header>

          <section className="bd-section" aria-labelledby="bd-cv-head">
            <Eyebrow id="bd-cv-head" href="/crossview" more="전체 크로스뷰">
              {crossview.length > 0
                ? "오늘의 크로스뷰 — 같은 사안, 두 개의 시선"
                : "오늘의 크로스뷰 · 준비 중"}
            </Eyebrow>
            {crossview.length > 0 ? (
              <>
                {/* 카드 스토리 격자 — 홈 덱(폰)과 같은 4페이지 카드(표지 → 광역 → 기초 → 의견)를 좌우로 넘겨 본다.
                    "메인 크로스뷰도 카드뉴스 형태·좌우 스크롤"(2026-10-19 피드백). 상위 6쌍은 스토리, 나머지는 괘선 목록. */}
                {stories.length > 0 && (
                <ul className="bd-stories" aria-label="오늘의 크로스뷰 카드 스토리">
                  {stories.map((item, i) => (
                    <li key={item.id}>
                      {/* 표지 사진은 첫 줄(2장)만 eager — 나머지는 뷰포트 진입 시 */}
                      <CardStory pair={item} height={560} eagerCover={i < 2} detailHref={`/crossview/${item.id}`} />
                    </li>
                  ))}
                </ul>
                )}
                {rest.length > 0 && (
                  <ol className="bd-cv" start={stories.length + 1}>
                    {rest.map((item, i) => (
                      <CrossviewRow item={item} index={stories.length + i} temperature={temperature} key={item.id} />
                    ))}
                  </ol>
                )}
              </>
            ) : (
              <p className="bd-empty">아직 매칭된 크로스뷰가 없습니다.</p>
            )}
          </section>

          {/* 공고 — 종이 단색 타일 4열 */}
          {notices.length > 0 && (
            <section className="bd-section" aria-labelledby="bd-notice-head">
              <Eyebrow id="bd-notice-head" href="/notices" more="공고 전체">
                {region.government.noticesLabel}
              </Eyebrow>
              <ul className="bd-tiles">
                {notices.slice(0, 8).map((n) => (
                  <li className="bd-tile bd-tile--notag" key={n.id}>
                    {/* 제목도 원문으로(시범단 #177) — 아래 "공고 원문 보기 →" 와 같은 링크 속성 */}
                    <h3 className="bd-tile-title">
                      {n.url ? (
                        <a
                          className="bd-tile-titlelink"
                          href={n.url}
                          target="_blank"
                          rel="noopener noreferrer nofollow"
                        >
                          {n.title}
                        </a>
                      ) : (
                        n.title
                      )}
                    </h3>
                    {/* 공고 번호·게시자(담당 부서)는 미리보기에서 뺀다(Figma #8) — 원문에 있음 */}
                    {fmtDate(n.publishedAt) && <p className="bd-tile-meta">{fmtDate(n.publishedAt)}</p>}
                    {n.url && (
                      <a
                        className="bd-tile-link"
                        href={n.url}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                      >
                        공고 원문 보기 →
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}


          {/* 여론광장 — 종이 단색 타일 4열 */}
          {forum.length > 0 && (
            <section className="bd-section" aria-labelledby="bd-forum-head">
              <Eyebrow id="bd-forum-head" href="/forum" more="공론장 전체">
                여론광장 — 주민들이 남긴 말
              </Eyebrow>
              <ul className="bd-tiles">
                {forum.slice(0, 8).map((p) => (
                  <li className="bd-tile" key={p.id}>
                    <span className="bd-tile-tag">{p.displayName || "익명"}</span>
                    <h3 className="bd-tile-title">
                      <Link className="bd-tile-titlelink" href={`/forum/${p.id}`}>
                        “{p.body}”
                      </Link>
                    </h3>
                    <p className="bd-tile-meta">
                      {fmtDate(p.createdAt)}
                      {p.likeCount ? ` · 공감 ${p.likeCount}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </main>

        {/* ── 우 1/3 sticky — 온도 TOP5 / 오늘의 충북 / 마감 / 해결 ───────────── */}
        <aside className="bd-side" aria-label="오늘의 요약">
          {/* 온도 TOP5 — 잉크 점 5개(크기·적색 농도 = 온도) + 이슈명 + 낱말(구간명) 앞·숫자 뒤(15px) */}
          <section className="bd-section" aria-labelledby="bd-temp-head">
            <Eyebrow id="bd-temp-head" href="/temperature" more="온도계">
              공론 온도 TOP5
            </Eyebrow>
            {top5.length > 0 ? (
              <>
                <ol className="bd-temp">
                  {top5.map((row, i) => {
                    const t = Math.max(0, Math.min(100, Number(row.temperature) || 0));
                    const band = bandFor(row.temperature);
                    return (
                      <li className="bd-temp-row" key={row.id}>
                        <Link
                          className="bd-temp-link"
                          href="/temperature"
                          aria-label={`${i + 1}위 ${row.issue?.label ?? "이름 없는 사안"} 공론 온도 ${Math.round(t)}도 ${band.label} — 온도계 열기`}
                        >
                          {/* 잉크 점 — 크기 14→24px, 회색→수은 농도 = 온도(0~100) */}
                          <span
                            className="bd-temp-dot"
                            aria-hidden="true"
                            style={{ "--t": t / 100 } as CSSProperties}
                          />
                          <span className="bd-temp-label">{row.issue?.label ?? "이름 없는 사안"}</span>
                          {/* [피그마 #6] 낱말+숫자만 밴드 색 — 사안명은 잉크 그대로 */}
                          <span className="bd-temp-val" data-band={bandKey(band.label)}>
                            <span className="bd-temp-band">{band.label}</span>
                            <span className="bd-temp-num">{Math.round(t)}°</span>
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ol>
                <p className="bd-side-meta">
                  {allCalm ? "오늘은 잠잠합니다 — 순위로 보기 · " : ""}
                  산출 {fmtDateTime(temperatureComputedAt) || "—"}
                </p>
              </>
            ) : (
              <p className="bd-empty dotted">온도 수집 중</p>
            )}
          </section>

          {/* 오늘의 충북 — 회차 예고(내용 요약 헤드라인·상대 날짜·길이) + "▶ 듣기" 하나.
              자체 플레이어 없음 — 재생은 좌 레일 백색원(#side-play, 전역 플레이어)이 맡는다.
              [피그마 #4] 제목 자리에 episodeHeadline(대본 topics 조합)을 쓰고 대본 발췌 줄은
              헤드라인을 못 지은 회차에만 남긴다. [피그마 #2] 날짜는 "5일 전" 상대 표기. */}
          {ep && (
            <section className="bd-section bd-podcast" aria-labelledby="bd-pod-head">
              <Eyebrow id="bd-pod-head" href="/podcast" more="지난 회차">
                {region.podcast.seriesName}
              </Eyebrow>
              <h2 className="bd-pod-title">
                {podHeadline}
                {podDateTitle ? <span className="sr-only"> ({podDateTitle})</span> : null}
              </h2>
              <p className="bd-side-meta">
                {/* 상대 표기는 기준 시각이 KST 자정을 넘기면 서버·클라이언트가 한 칸 다를 수 있다 */}
                <time
                  dateTime={ep.publishedAt ?? undefined}
                  suppressHydrationWarning
                  title={absoluteKo(ep.publishedAt)}
                >
                  {relativeKo(ep.publishedAt) || fmtDate(ep.publishedAt)}
                </time>
                {minutes !== null ? ` · ${minutes}분` : ""}
              </p>
              {podHeadline === podDateTitle && (
                <ul className="bd-pod-lines">
                  {teaserLines(ep).map((l, i) => (
                    <li key={i}>
                      <span>{l}</span>
                    </li>
                  ))}
                </ul>
              )}
              <ListenButton ep={ep} where="왼쪽" />
            </section>
          )}

          {/* 마감 D-day — 있을 때만. 주황 점은 D-day 가 줄수록 커진다(8→20px) */}
          {deadlines.length > 0 && (
            <section className="bd-section" aria-labelledby="bd-dl-head">
              <Eyebrow id="bd-dl-head" href="/notices" more="공고">
                마감 D-day
              </Eyebrow>
              <ul className="bd-dl">
                {deadlines.slice(0, 3).map((d) => {
                  const urgency = Math.max(0, Math.min(1, 1 - Math.min(d.daysLeft, 30) / 30));
                  return (
                    <li className="bd-dl-row" key={d.id}>
                      <span
                        className="bd-dl-dot"
                        aria-hidden="true"
                        style={{ "--u": urgency } as CSSProperties}
                      />
                      <span className="bd-dl-day">{ddayLabel(d.daysLeft)}</span>
                      <span className="bd-dl-main">
                        {d.sourceUrl ? (
                          <a
                            className="bd-dl-title"
                            href={d.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer nofollow"
                          >
                            {d.title}
                          </a>
                        ) : (
                          <span className="bd-dl-title">{d.title}</span>
                        )}
                        <span className="bd-dl-meta">
                          {shortDeadline(d.deadline)} 마감
                          {d.benefitLabel ? ` · ${d.benefitLabel}` : ""}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {/* 해결됐어요 — 크림면 #f2e6d8(유채색 면은 화면의 5% 이내, 한 곳) */}
          {resolutions.length > 0 && (
            <section className="bd-section bd-resolve" aria-labelledby="bd-rs-head">
              <Eyebrow id="bd-rs-head">해결됐어요</Eyebrow>
              <ul className="bd-rs">
                {resolutions.slice(0, 2).map((s) => (
                  <li className="bd-rs-item" key={s.id}>
                    <h3 className="bd-rs-title">{s.title}</h3>
                    {s.reportedOn && s.resolvedOn && (
                      <p className="bd-rs-meta">
                        {shortDate(s.reportedOn)} 제보 → {shortDate(s.resolvedOn)} 해결
                        {s.daysToResolve != null ? ` (${s.daysToResolve}일)` : ""}
                      </p>
                    )}
                    <p className="bd-rs-body">{s.timeline}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
      <SiteFooter className="bd-footer" />
    </div>
  );
}
