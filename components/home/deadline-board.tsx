// ============================================================================
// components/home/deadline-board — "놓치면 손해" 마감 밴드 (관보 상단 주황 띠)
//
// 마감이 있는 지원·신청·안내를 D-day 순으로 보여 준다. 항목이 없으면 섹션
// 자체를 렌더하지 않는다(불파괴 — deadline_items 가 전부 경과하면 자동 숨김).
//
// 기획안 (5) 공고: 주황 #f9a03f 풀블리드 띠 위 잉크 글자.
//   "N일 후 마감"(당일 "오늘 마감") 40px 800 + benefit_label + 가로 선.
//   가로 선 = 경과 실선 · 남은 기간 점선(30일 창 기준). 경계의 잉크 점은 D-3 이내에서
//   8→20px 로 커진다(색 의존 0 — 숫자·활자가 먼저, 점은 보강).
//
// 도면 반영(피그마 코멘트 2026-09-11)
//   · #1  게이지 선(.dl-line)은 **데스크탑에서만 항목 위**("놓치면 손해" 라벨 바로 아래·
//         제목 위)로 올라간다. DOM 순서는 그대로 두고 app/notices.css 의 ≥1100px 블록에서
//         order:-1 로 옮기므로, 모바일은 지금처럼 항목 아래에 남는다.
//   · #8  메타 첫 자리가 마감일. 게시자(부서명) 칩은 삭제.
//   · #11 데스크탑은 항목마다 있던 1px 상단 괘선을 지우고 띠 아래 경계 한 줄만 둔다(CSS).
// 카드·필·라운드 없음. 스타일: app/notices.css (.dl-*)
// ============================================================================

import type { DeadlineItem } from "./action-layer";
import "@/app/notices.css";

/** 마감 선의 기준 창 — 이 일수보다 많이 남았으면 선 전체가 점선(경과 0) */
const WINDOW_DAYS = 30;

/** 경과 백분율(0~100) — 30일 창에서 오늘까지 지난 비율 */
function elapsedPercent(daysLeft: number): number {
  const left = Math.max(0, Math.min(WINDOW_DAYS, daysLeft));
  return Math.round(((WINDOW_DAYS - left) / WINDOW_DAYS) * 100);
}

/** 경계 잉크 점 지름 — D-3 초과 8px, D-3 → 11 · D-2 → 14 · D-1 → 17 · D-0 → 20px */
function dotSize(daysLeft: number): number {
  if (daysLeft > 3) return 8;
  return 8 + (3 - Math.max(0, daysLeft)) * 4;
}

/** 마감일 짧은 표기 "7/22(수)" */
function shortDeadline(deadline: string): string {
  // 월·일은 문자열에서 바로 — getMonth/getDate 는 로컬 타임존에 따라 하루가 밀린다(SSR≠브라우저)
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(deadline);
  if (!m) return deadline;
  const weekday = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    weekday: "short",
  }).format(new Date(`${m[0]}T00:00:00+09:00`));
  return `${Number(m[2])}/${Number(m[3])}(${weekday})`;
}

/** 마감 선 — SVG 한 줄. 왼쪽 실선(경과) + 오른쪽 점선(남은 기간) + 경계 점 */
function DeadlineLine({ daysLeft }: { daysLeft: number }) {
  const elapsed = elapsedPercent(daysLeft);
  const dot = dotSize(daysLeft);
  return (
    <svg className="dl-line" aria-hidden="true" focusable="false">
      {/* 남은 기간 — 점선(전체 폭) */}
      <line className="dl-line-rest" x1="0" y1="10" x2="100%" y2="10" />
      {/* 경과 — 실선(왼쪽부터 이어짐) */}
      {elapsed > 0 ? (
        <line className="dl-line-past" x1="0" y1="10" x2={`${elapsed}%`} y2="10" />
      ) : null}
      {/* 오늘의 자리 — 잉크 점(D-day 가 줄수록 커진다) */}
      <circle className="dl-line-dot" cx={`${elapsed}%`} cy="10" r={dot / 2} />
    </svg>
  );
}

function DeadlineRow({ item }: { item: DeadlineItem }) {
  const today = item.daysLeft === 0;
  return (
    <article className="dl-item">
      {/* "N일 후 마감" — 0일은 "오늘 마감"(도면 문구, 2026-09-13) */}
      <p className="dl-days">{today ? "오늘 마감" : `${item.daysLeft}일 후 마감`}</p>

      {/* 제목도 원문으로(시범단 #177) — 일반 공고 목록(.nt-row-link)과 같은 링크 속성. 원문이 없으면 활자만 */}
      <h3 className="dl-title">
        {item.sourceUrl ? (
          <a
            href={item.sourceUrl}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="dl-title-link"
          >
            {item.title}
          </a>
        ) : (
          item.title
        )}
      </h3>

      {/* 도면 #8 — 제목 바로 아래 첫 자리가 마감일. 게시자(공고는 category 자리에 담당 부서가
          들어온다)는 지웠다. 수기 항목의 혜택·지역은 독자가 쓸 값이라 날짜 뒤에 남긴다 */}
      <p className="dl-meta">
        {/* 날짜만 — "마감" 낱말은 뺐다(검토 2026-09-21). 큰 글자가 이미 "N일 후 마감"이라 되풀이였다 */}
        <span>
          <time dateTime={item.deadline} aria-label={`${shortDeadline(item.deadline)} 마감`}>
            {shortDeadline(item.deadline)}
          </time>
        </span>
        {item.benefitLabel ? <span className="dl-benefit">{item.benefitLabel}</span> : null}
        {item.region ? <span>{item.region}</span> : null}
        {item.sourceUrl ? (
          <a
            href={item.sourceUrl}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="dl-src"
          >
            원문 ↗
          </a>
        ) : null}
      </p>

      <DeadlineLine daysLeft={item.daysLeft} />
    </article>
  );
}

/** 놓치면 손해 밴드 — 항목 없으면 미노출 */
export function DeadlineBoard({ items }: { items: DeadlineItem[] }) {
  if (items.length === 0) return null;

  return (
    <section aria-labelledby="deadline-board" className="dl-band">
      <div className="dl-head">
        <h2 id="deadline-board" className="dl-head-title">
          놓치면 손해
        </h2>
        <span className="dl-head-meta">마감 가까운 순</span>
      </div>

      {items.map((item) => (
        <DeadlineRow key={item.id} item={item} />
      ))}
    </section>
  );
}
