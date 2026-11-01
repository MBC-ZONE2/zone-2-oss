"use client";
// 릴스형 덱의 슬라이드들 — 슬라이드 1장 = DB 항목 1개.
// 기획안 「일점 지면」: 종이 위 괘선과 활자. 카드·그림자·라운드 없음, 등장 애니메이션 없음.
import Link from "next/link";
import type { CrossviewPairWithArticles } from "@/lib/matching";
import type { Episode, ForumPost, TemperatureBoardItem } from "@/types";
import {
  bandFor,
  crossviewTitle,
  tempForItem,
  cardSlidesOf,
  fmtDate,
  fmtDateTime,
  scriptLines,
  type NoticeItem,
} from "@/lib/reels/deck";
import type { DeadlineItem } from "@/components/home/action-layer";
import { usePlayer, type PlayerEpisode } from "@/components/player/player-provider";
import { MediaIcon } from "@/components/ui/media-icon";
// 대본 → 예고 문장·키워드·표시용 헤드라인 (순수 함수, 깊은 경로로 생성 파이프라인을 끌고 오지 않는다)
import { episodeTeaser, episodeDisplayHeadline } from "@/lib/podcast/script";
// Figma 코멘트 #2: 날짜는 상대 표기("5일 전") — 절대 날짜는 <time dateTime>·title 로 남긴다
import { relativeKo, absoluteKo } from "@/lib/ui/relative-time";
import CardRail from "./card-rail";
import TempChip from "./temp-chip";
import PairPhoto from "./pair-photo";
import { pairImageCandidates } from "@/lib/reels/pair-image";
import CardStory from "./card-story";
import BrandVideoButton from "./brand-video";
import { SiteFooter } from "@/components/site-footer";
import { region } from "@/config/region";

function Kind({ children }: { children: React.ReactNode }) {
  return <span className="kind">{children}</span>;
}

/* ── 크로스뷰 텍스트 유틸 (순수 함수) ─────────────────────────────────── */

/**
 * card_headline "광역은 …, 기초는 …" 을 첫 쉼표(, ，) 기준 두 줄로 분해.
 * 쉼표가 없으면 한 줄(마커 없음). 공백은 정리한다.
 */
export function splitHeadline(headline: string | null | undefined): string[] {
  const h = String(headline || "").replace(/\s+/g, " ").trim();
  if (!h) return [];
  const idx = h.search(/[,，]/);
  if (idx < 0) return [h];
  const a = h.slice(0, idx).trim();
  const b = h.slice(idx + 1).trim();
  return b ? [a, b] : [a];
}

/** reading_point 첫 문장(마침표·물음표·느낌표 뒤 공백/끝 기준). 없으면 전체. */
export function firstSentence(text: string | null | undefined): string {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  const m = t.match(/^[\s\S]*?[.。!?](?=\s|$)/);
  return m ? m[0].trim() : t;
}

/** 광역 ⋯ 도트 3개 / 기초 ▬ 괘선 토막 — 마커 색은 이 6px 도형에만 */
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

/**
 * 크로스뷰 헤드라인 — card_headline 을 두 줄로 조판. 1줄 광역(⋯) / 2줄 기초(▬), 두 줄 같은 굵기·크기
 * (검토의견 홈 5 — 마커로만 가른다). 매체명은 스크린리더 전용 텍스트로 병기(색 의존 0).
 * cardHeadline 없으면 crossviewTitle 한 줄.
 */
function CrossviewHeadline({
  item,
  xl = false,
}: {
  item: CrossviewPairWithArticles;
  xl?: boolean;
}) {
  const lines = splitHeadline(item.cardHeadline);
  const cls = `cvx-head${xl ? " xl" : ""}`;
  if (lines.length < 2) {
    return (
      <h2 className={cls}>
        <span className="cvx-line plain">
          <span className="cvx-text">{lines[0] || crossviewTitle(item)}</span>
        </span>
      </h2>
    );
  }
  return (
    <h2 className={cls}>
      <span className="cvx-line macro">
        <Marker side="macro" />
        <span className="cvx-text">
          <span className="sr">{`${region.outlets.macro.tier} ${region.outlets.macro.name}: `}</span>
          {lines[0]}
        </span>
      </span>
      <span className="cvx-line micro">
        <Marker side="micro" />
        <span className="cvx-text">
          <span className="sr">{`${region.outlets.micro.tier} ${region.outlets.micro.name}: `}</span>
          {lines[1]}
        </span>
      </span>
    </h2>
  );
}

/**
 * 크로스뷰 카드(홈 덱 공통) — 지면 순서:
 * 헤드라인(두 줄) → 사진 40dvh 풀블리드(휴면 점묘 → 진입 시 해상; pairImage 로 옥천신문 원본
 * 우선, 원본이면 아래 13px "사진 · 옥천신문" 출처) → 읽는 점 첫 문장
 * → 메타·온도 → 괘선 → "두 시선 자세히 읽기 →" + 원문 링크.
 * 사진이 없으면 괘선 두 줄 사이에 헤드라인 40px 로 확대(폴백). 요약 패널은 상세에서 읽는다.
 * Fragment 로 반환해 각 요소가 .s-card 직계 자식(좌측 기준선)이 되게 한다.
 */
function CrossviewNewsCard({
  item,
  temperature,
  meta,
}: {
  item: CrossviewPairWithArticles;
  temperature: TemperatureBoardItem[];
  meta?: React.ReactNode;
}) {
  // 표지 사진 — 옥천신문 원본 → MBC 원본 → AI 카드 이미지 (회의 결정 [3]).
  // 후보가 하나라도 있으면 사진 조판, 로딩이 깨지면 PairPhoto 가 다음 후보로 내려간다.
  const photos = pairImageCandidates(item);
  const hasImage = photos.length > 0;
  const point = firstSentence(item.readingPoint);
  return (
    <>
      {hasImage ? (
        <>
          <CrossviewHeadline item={item} />
          <PairPhoto candidates={photos} heightClass="dot-h-hero" className="bleed" />
        </>
      ) : (
        <>
          <hr className="cvx-rule" />
          <CrossviewHeadline item={item} xl />
          <hr className="cvx-rule" />
        </>
      )}
      {point && <p className="cvx-point">{point}</p>}
      <p className="cvx-meta">
        <span>{fmtDate(item.createdAt)}</span>
        {/* 출처 — 송신탑/종이신문 아이콘(장식)을 매체명 앞에 */}
        <span className="src-pair">
          <MediaIcon kind="broadcast" className="media-ic" />
          {region.outlets.macro.name}
          <span className="src-sep" aria-hidden="true">·</span>
          <MediaIcon kind="paper" className="media-ic" />
          {region.outlets.micro.name}
        </span>
        {meta}
      </p>
      <TempChip match={tempForItem(item, temperature)} />
      <hr className="cvx-rule" />
      <nav className="cvx-links" aria-label="크로스뷰 링크">
        <Link className="cvx-more" href={`/crossview/${item.id}`}>
          두 시선 자세히 읽기 →
        </Link>
        {(item.macro?.url || item.micro?.url) && (
          <span className="cvx-src">
            {item.macro?.url && (
              <a href={item.macro.url} target="_blank" rel="noopener noreferrer nofollow">
                광역 원문
              </a>
            )}
            {item.micro?.url && (
              <a href={item.micro.url} target="_blank" rel="noopener noreferrer nofollow">
                기초 원문
              </a>
            )}
          </span>
        )}
      </nav>
    </>
  );
}

/**
 * "▶ 듣기" 큰 활자 버튼 — 전역 플레이어의 리모컨(검토의견 홈 2: 재생 진입은 백색원 하나로).
 * 회차를 큐 형식(PlayerEpisode)으로 바꿔 usePlayer().play(ep) 를 부르면 하단 #fn-play(모바일)·
 * 좌 레일 #side-play(데스크탑)가 재생 상태(파형)로 바뀐다. 재생 중이면 같은 버튼이 일시정지.
 * 오디오가 아직 없는 회차(ep.audioUrl 없음)는 실제로 동작할 수 없으므로 disabled + "오디오 준비 중".
 * audioUrl 은 원본 값을 그대로 넘긴다(절대 URL 아니면 provider 의 resolveAudioSrc 가 스트리밍
 * 라우트로 바꾼다) — 여기서 경로를 만들어 넘기면 now-line 이 "오디오 있음"으로 오인한다.
 * where: 재생 버튼(주황, 회의 결정 [2])이 어디 있는지 안내 문구("하단"/"왼쪽"). 옛 "백색원" 문구는 버튼이 주황으로 바뀐 뒤 정정(2026-10-26).
 */
export function ListenButton({ ep, where = "하단" }: { ep: Episode; where?: string }) {
  const player = usePlayer();
  const hasAudio = Boolean(ep.audioUrl);
  const isCurrent = player.current?.id === ep.id;
  const playing = isCurrent && player.isPlaying;
  const onClick = () => {
    if (!hasAudio) return;
    if (playing) {
      player.pause();
      return;
    }
    const q: PlayerEpisode = {
      id: ep.id,
      title: ep.title,
      headline: episodeDisplayHeadline(ep),
      audioUrl: ep.audioUrl ?? null,
      durationSec: ep.durationSec ?? null,
      publishedAt: ep.publishedAt ?? null,
    };
    player.play(q);
  };
  if (!hasAudio) {
    // 오디오 없음 — 동작 불가이므로 disabled(대비는 reels.css .pod-listen:disabled 가 유지)
    return (
      <button
        type="button"
        className="pod-listen is-pending"
        disabled
        aria-label={`${ep.title} 오디오 준비 중`}
      >
        <span className="pod-listen-main">
          <span className="pod-listen-glyph" aria-hidden="true">▶</span>
          오디오 준비 중
        </span>
        <span className="pod-listen-sub">이 회차의 음성이 아직 만들어지지 않았습니다</span>
      </button>
    );
  }
  return (
    <button
      type="button"
      className={playing ? "pod-listen is-playing" : "pod-listen"}
      onClick={onClick}
      aria-label={playing ? `${ep.title} 일시정지` : `${ep.title} 듣기`}
    >
      <span className="pod-listen-main">
        <span className="pod-listen-glyph" aria-hidden="true">
          {playing ? "❚❚" : "▶"}
        </span>
        {playing ? "일시정지" : "듣기"}
      </span>
      <span className="pod-listen-sub">
        {playing ? `${where} 재생 버튼에서 재생 중입니다` : `${where} 재생 버튼으로 재생됩니다`}
      </span>
    </button>
  );
}

/* ── 팟캐스트: podcast_episodes 1행 — 검정(#000) 세계(검토 2026-09-21, 팟캐 헤더와 동일) ──
   회차 예고만: 아이브로우 → 내용 요약 헤드라인 26px(코멘트 #4) → 메타(상대 날짜·길이,
   코멘트 #2) → (헤드라인을 못 지은 회차만) 예고 문장(흰 괘선)
   → "▶ 듣기 — 하단 백색원으로 재생됩니다" 큰 활자 버튼 하나(자체 플레이어 없음).
   재생·진행·±15초·배속은 전부 하단 백색원(전역 플레이어 시트)이 맡는다.
   회의 결정 [7]: 예고 문장은 대본 앞 두 줄(인사말)이 아니라 헤드라인 첫 문장(lead)이다. */
/** 회차 예고 1~2줄 — [대표 문장, "· 키워드 · 키워드"] (홈 슬라이드·데스크탑 레일 공용) */
export function teaserLines(ep: Episode): string[] {
  const { lead, topics } = episodeTeaser(ep.script);
  if (!lead) return scriptLines(ep, 2); // 휴리스틱 실패 시 예전대로 대본 앞 두 줄
  const keywords = topics.map((t) => `· ${t}`).join(" ");
  return keywords ? [lead, keywords] : [lead];
}

export function PodcastSlide({ ep }: { ep: Episode }) {
  // 코멘트 #4: 제목 자리 = 내용 요약 헤드라인. 날짜 제목은 낭독기용 sr-only 로만 남긴다
  const dateTitle = (ep.title || "").trim();
  const headline = episodeDisplayHeadline(ep);
  // 헤드라인을 못 지어 날짜 제목으로 떨어진 회차만 예고 줄을 남긴다(빈 카드 방지)
  const lines = headline === dateTitle ? teaserLines(ep) : [];
  const when = relativeKo(ep.publishedAt);

  return (
    <article className="s-card">
      <Kind>{region.podcast.seriesName} · 오디오</Kind>
      <h2 className="s-title">
        {headline}
        {dateTitle ? <span className="sr-only"> ({dateTitle})</span> : null}
      </h2>
      <p className="s-meta">
        {/* 상대 표기는 기준 시각이 KST 자정을 넘기면 서버·클라이언트가 한 칸 다를 수 있다 */}
        <time
          dateTime={ep.publishedAt ?? undefined}
          suppressHydrationWarning
          title={absoluteKo(ep.publishedAt)}
        >
          {when || fmtDate(ep.publishedAt)}
        </time>{" "}
        · {Math.round((ep.durationSec || 0) / 60)}분
      </p>
      {lines.length > 0 && (
        <ul className="lines">
          {lines.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      )}
      <ListenButton ep={ep} where="하단" />
      <div className="s-actions">
        <Link className="btn" href="/podcast">
          전체 대본과 지난 회차
        </Link>
      </div>
    </article>
  );
}

/** 온도 밴드 라벨 → CSS data-band 키 (한글 라벨을 셀렉터에 쓰지 않기 위한 매핑) */
const BAND_KEY: Record<string, string> = {
  잠잠: "calm",
  미온: "mild",
  보통: "warm",
  뜨거움: "hot",
  "매우 뜨거움": "very-hot",
};

/* ── 공론 온도: temperature_scores 상위 + issues ─────────────────────── */
export function TemperatureSlide({
  items,
  computedAt,
}: {
  items: TemperatureBoardItem[];
  computedAt: string | null;
}) {
  // 기획안 6절: 최신 배치가 전부 0° 면 "오늘은 잠잠합니다" 행 + 순위만(온도·게이지 생략)
  const top = items.slice(0, 5);
  const quiet = top.every((row) => !(Number(row.temperature) > 0));
  return (
    <article className="s-card">
      <Kind>공론 온도 · TOP5</Kind>
      <h2 className="s-title">지금 뜨거운 이슈</h2>
      <p className="s-meta">산출 {fmtDateTime(computedAt)} · 15분마다 갱신 · 5구간</p>
      {quiet && (
        <p className="t-quiet">
          오늘은 잠잠합니다
          <small>온도가 아직 오르지 않아 순위로만 보여드립니다</small>
        </p>
      )}
      <ol className={quiet ? "t-list is-quiet" : "t-list"}>
        {top.map((row) => {
          const band = bandFor(row.temperature);
          const delta = (row.prevRank ?? row.rank ?? 0) - (row.rank ?? 0);
          const pct = Math.min(100, Math.max(0, row.temperature || 0));
          return (
            <li className="t-row" data-band={BAND_KEY[band.label] || "calm"} key={row.id}>
              <span className="t-rank">{row.rank}</span>
              <span className="t-label">
                {/* 사안을 누르면 상세(관련 기사·원문·추이)로 — "온도계 클릭 시 기사로"(2026-10-19 피드백) */}
                {row.issueId ? (
                  <Link href={`/temperature/${row.issueId}`} className="t-label-link">
                    {row.issue?.label}
                  </Link>
                ) : (
                  row.issue?.label
                )}
                {(row.issue?.keywords?.length ?? 0) > 1 && (
                  <small>{row.issue?.keywords?.slice(0, 3).join(" · ")}</small>
                )}
              </span>
              <span
                className="t-delta"
                data-d={delta > 0 ? "up" : delta < 0 ? "down" : "same"}
              >
                {delta > 0 ? `▲${delta}` : delta < 0 ? `▼${-delta}` : "–"}
              </span>
              {!quiet && (
                <span className="t-val">
                  {/* 낱말(구간명 20px + 구간 색 6px 점)이 앞, 숫자는 뒤에 작게 15px — 색은 점에만 */}
                  <em className="t-band">
                    <i className="t-band-dot" aria-hidden="true" />
                    {band.label}
                  </em>
                  <span className="t-num">{row.temperature}°</span>
                </span>
              )}
              {/* 온도 0~100 가로 게이지(1px 선) — 수치를 길이로도 읽게 해 색맹·저시력에서도
                  변별되게 한다. 수치·라벨 텍스트가 이미 있으므로 스크린리더에서 숨긴다. */}
              {!quiet && (
                <span className="t-gauge" aria-hidden="true">
                  <span className="t-gauge-fill" style={{ width: `${pct}%` }} />
                </span>
              )}
            </li>
          );
        })}
      </ol>
      <p className="s-note">
        온도 = 언급 빈도·감정 변화·주제 집중도 조합. 구간: 잠잠·미온·보통·뜨거움·매우 뜨거움.
      </p>
    </article>
  );
}

/* ── 크로스뷰: crossview_pairs 1행 ──────────────────────────────────── */
export function CrossviewSlide({
  item,
  temperature,
}: {
  item: CrossviewPairWithArticles;
  temperature: TemperatureBoardItem[];
}) {
  // kind 라벨은 덱 topbar 가 담당 — 카드 안에는 넣지 않는다.
  return (
    <article className="s-card">
      <CrossviewNewsCard
        item={item}
        temperature={temperature}
        meta={<span>매칭 {Math.round((item.matchScore || 0) * 100)}점</span>}
      />
    </article>
  );
}

/* ── 크로스뷰 카드 스토리: crossview_pairs.card_data.slides ≥ 3 ─────────
   4페이지 가로 스냅 스토리(<CardStory>)를 슬라이드 가용 높이(100dvh−topbar−nav)
   안에 세로 중앙으로 앉힌다. 풀블리드(.bleed) — 좌측 기준선은 스토리 안에서 잡는다.
   카드가 3장 미만이면(buildDeck 은 이 경우 이 kind 를 만들지 않지만 방어) 기존 레일. */
export function CrossviewCardsSlide({
  item,
  temperature,
}: {
  item: CrossviewPairWithArticles;
  temperature: TemperatureBoardItem[];
}) {
  const cards = cardSlidesOf(item);
  if (cards.length >= 3) {
    return (
      <article className="s-card">
        <CardStory pair={item} height="fill" detailHref={`/crossview/${item.id}`} className="bleed" />
      </article>
    );
  }

  return (
    <article className="s-card">
      <CrossviewNewsCard
        item={item}
        temperature={temperature}
        meta={<span>한 장씩 넘겨 보세요</span>}
      />
      <CardRail count={cards.length}>
        {cards.map((c, i) => (
          <div className={`rail-card news ${c.kind || ""}`} key={i}>
            <span className="rc-tag">
              {c.kind === "macro" ? (
                <>
                  <MediaIcon kind="broadcast" className="media-ic" /> {region.outlets.macro.tier} · {region.outlets.macro.name}
                </>
              ) : c.kind === "micro" ? (
                <>
                  <MediaIcon kind="paper" className="media-ic" /> {region.outlets.micro.tier} · {region.outlets.micro.name}
                </>
              ) : (
                c.sourceLabel || region.site.name
              )}
            </span>
            {c.title && <h3 className="rc-title">{c.title}</h3>}
            <p className="rc-body">{c.body}</p>
          </div>
        ))}
      </CardRail>
    </article>
  );
}

/** 관보 좌열용 날짜 분해 — 일(40px)·월(15px). 파싱 실패면 null */
function dateParts(iso: string | null | undefined): { day: number; month: number; key: string } | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return { day: d.getDate(), month: d.getMonth() + 1, key: `${d.getMonth() + 1}-${d.getDate()}` };
}

/** "YYYY-MM-DD" → "M/D 마감" (문자열 파싱만 — Date/타임존 비의존) */
function shortDeadlineLabel(deadline: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(deadline);
  if (!m) return "";
  return `${Number(m[2])}/${Number(m[3])}`; // "마감" 낱말은 뺐다 — 띠의 큰 글자가 이미 말한다(검토 2026-09-21)
}

/* ── 군청 공고: articles(oc_gov, 게시판 4종) — 관보 조판 ────────────────
   종이 세계. 상단 풀블리드 주황(#f9a03f) 띠에 "N일 후 마감"(잉크 글자)
   → 괘선 목록: 좌열 게시일("게시 N월" 15px + 일 40px) | 제목 20px + 부서 15px.
   같은 날짜는 좌열을 비워 괘선으로 묶는다. 행 전체가 원문 링크(있을 때).
   좌열 머리의 "게시"는 회의 결정 [공고 날짜 구분] — 띠의 마감일과 목록의 게시일이
   같은 40px 숫자라 라벨 없이는 게시일이 마감처럼 읽혔다. */
export function NoticesSlide({
  notices,
  deadlines = [],
}: {
  notices: NoticeItem[];
  /** 놓치면 손해(임박 순). daysLeft 는 서버(page.tsx→action-layer)에서 KST 로 계산돼 온다 */
  deadlines?: DeadlineItem[];
}) {
  const items = notices.slice(0, 6);
  // 가장 임박한 마감 1건 — 클라이언트에서 new Date() 를 쓰지 않는다(하이드레이션 불일치 방지)
  const soonest = deadlines.find((d) => Number.isFinite(d.daysLeft) && d.daysLeft >= 0) ?? null;
  let prevKey = "";
  return (
    <article className="s-card">
      {/* 마감 띠 — 마감이 있으면 "N일 후 마감"(당일 "오늘 마감") 40px 숫자, 없으면 공고 건수 */}
      <div className="gz-band bleed">
        {soonest ? (
          <span className="gz-band-in">
            {soonest.daysLeft === 0 ? (
              <span className="gz-band-n">
                오늘<small>마감</small>
              </span>
            ) : (
              <span className="gz-band-n">
                {soonest.daysLeft}
                <small>일 후 마감</small>
              </span>
            )}
            <span className="gz-band-t">
              {soonest.sourceUrl ? (
                <a href={soonest.sourceUrl} target="_blank" rel="noopener noreferrer nofollow">
                  {soonest.title}
                </a>
              ) : (
                <span>{soonest.title}</span>
              )}
              <time dateTime={soonest.deadline} className="gz-band-d">
                {shortDeadlineLabel(soonest.deadline)}
              </time>
            </span>
          </span>
        ) : (
          <span className="gz-band-in">
            <span className="gz-band-k">{region.government.noticesLabel}</span>
            <span className="gz-band-n">
              {notices.length}
              <small>건</small>
            </span>
          </span>
        )}
      </div>
      <Kind>{region.government.noticesLabel} · 관보</Kind>
      <h2 className="s-title">놓치면 아까운 이번 주 공고</h2>
      <p className="s-meta">공지·고시·입법예고·채용 자동 수집 · 행을 누르면 원문</p>
      <ol className="gz-list">
        {items.map((n) => {
          const dp = dateParts(n.publishedAt);
          const same = dp !== null && dp.key === prevKey;
          if (dp) prevKey = dp.key;
          const body = (
            <>
              <span className={same ? "gz-date is-same" : "gz-date"}>
                {dp ? (
                  <time dateTime={n.publishedAt || undefined}>
                    {/* "게시" 라벨 — 위 띠의 마감일과 구분(회의 결정: 공고 날짜 구분) */}
                    <small className="gz-month">게시 {dp.month}월</small>
                    <b className="gz-day">{dp.day}<small className="gz-unit">일</small></b>
                  </time>
                ) : (
                  <span className="gz-day gz-none" aria-hidden="true">
                    –
                  </span>
                )}
              </span>
              <span className="gz-main">
                <span className="gz-title">{n.title}</span>
                {/* 공고 번호·게시자(담당 부서)는 미리보기에서 뺀다 — 훑는 단계에선 소음이고
                    부서는 독자의 판단에 쓰이지 않는다(Figma #8, /notices 와 같은 규약) */}
              </span>
            </>
          );
          return (
            <li className="gz-row" key={n.id}>
              {n.url ? (
                <a
                  className="gz-link"
                  href={n.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  aria-label={`${n.title} — 공고 원문 보기`}
                >
                  {body}
                </a>
              ) : (
                <span className="gz-link">{body}</span>
              )}
            </li>
          );
        })}
      </ol>
      <div className="s-actions">
        <Link className="btn" href="/notices">
          공고 전체 보기
        </Link>
      </div>
    </article>
  );
}

/** 공감 수 → 앞 점 4단 크기 키(0 = 빈 링) */
function likeTier(n: number | null | undefined): 0 | 1 | 2 | 3 {
  const v = Number(n) || 0;
  if (v <= 0) return 0;
  if (v < 5) return 1;
  if (v < 20) return 2;
  return 3;
}

/* ── 여론광장: forum_posts — 검은 세계 괘선 목록 ──────────────────────
   앞 점(like_count 4단 크기, 0 이면 빈 링) · 본문 20px 700(제목 없이 본문 바로, 2026-10-19) · "이름 · 날짜" 15px.
   하단 "공론장 열기" 흰 테두리 버튼. */
export function ForumSlide({ posts }: { posts: ForumPost[] }) {
  const items = posts.slice(0, 5);
  return (
    <article className="s-card">
      <Kind>여론광장</Kind>
      <h2 className="s-title">주민들이 남긴 말</h2>
      <p className="s-meta">공론장에 올라온 주민 의견 · 익명은 해시 처리</p>
      <ol className="fr-list">
        {items.map((p) => (
          <li className="fr-row" key={p.id} data-tier={likeTier(p.likeCount)}>
            <Link className="fr-link" href={`/forum/${p.id}`}>
              <span className="fr-dot" aria-hidden="true" />
              <span className="fr-main">
                <span className="fr-title">{p.body}</span>
                <span className="fr-meta">
                  {p.displayName || "익명"} · {fmtDate(p.createdAt)}
                  {p.likeCount ? ` · 공감 ${p.likeCount}` : ""}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
      <div className="s-actions">
        <Link className="btn primary" href="/forum">
          공론장 열기
        </Link>
        <Link className="btn" href="/forum#post-form">
          의견 남기기
        </Link>
      </div>
    </article>
  );
}

/* ── 마지막 슬라이드 — 검은 세계 ────────────────────────────────────────
   "오늘 N장을 다 봤습니다" + 백색원 ▶ 다시 듣기(오늘의 충북)
   + 크로스뷰 전체 보기(홈은 최근 8장만 싣는다는 안내) + "맨 위로". */
export function EndSlide({
  computedAt,
  ep,
  crossviewShown = 0,
  crossviewTotal,
}: {
  computedAt: string | null;
  /** 오늘의 충북 에피소드(있으면 백색원 ▶ 다시 듣기) */
  ep?: Episode;
  /** 홈 덱에 실제로 실린 크로스뷰 장수(안내 문구용) */
  crossviewShown?: number;
  /** 승인 크로스뷰 전체 쌍 수 — 서버가 총계를 줄 때만 "전체 N쌍"으로 쓴다 */
  crossviewTotal?: number;
}) {
  // 개수 브리핑("N쌍")은 뺐다(2026-10-19 피드백) — 더 있는지만 말한다
  const knownMore = typeof crossviewTotal === "number" && crossviewTotal > crossviewShown;
  const moreLabel = "크로스뷰 전체 보기 →";

  return (
    <article className="s-card center">
      <Kind>끝</Kind>
      <h2 className="s-title">오늘 지면을 다 봤습니다</h2>
      <p className="s-meta">
        온도 산출 {fmtDateTime(computedAt)}
        <br />
        크로스뷰 · 공론 온도 · 오디오 브리핑 · 여론광장 · {region.government.noticesLabel}
      </p>
      {ep && (
        <Link className="end-replay" href="/podcast" aria-label={`${ep.title} 다시 듣기`}>
          <span className="end-circle" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden>
              <path d="M6 3l14 9-14 9V3z" />
            </svg>
          </span>
          <span className="end-replay-t">
            다시 듣기
            <small>{ep.title}</small>
          </span>
        </Link>
      )}
      {crossviewShown > 0 && (
        <>
          <p className="s-meta end-more-note">
            홈에는 최근 크로스뷰만 실었습니다.
            <br />
            {knownMore ? "나머지는 크로스뷰 목록에서 이어 볼 수 있습니다." : "크로스뷰 목록에서 전체를 볼 수 있습니다."}
          </p>
          {/* .btn 하나만 있는 .s-actions 는 :only-child 규칙으로 한 줄 폭을 다 쓴다 */}
          <div className="s-actions">
            <Link className="btn" href="/crossview">
              {moreLabel}
            </Link>
          </div>
        </>
      )}
      <div className="s-actions">
        <a className="btn" href="#reels-top">
          맨 위로
        </a>
      </div>
      <BrandVideoButton />
      {/* 푸터(2026-10-21) — 덱은 끝이 있으니 끝 슬라이드가 푸터 자리. 검은 세계라 종이색 띠로, 풀블리드 */}
      <SiteFooter tone="dark" className="bleed" />
    </article>
  );
}
