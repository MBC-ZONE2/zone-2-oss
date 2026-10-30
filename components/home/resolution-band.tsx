// ============================================================================
// components/home/resolution-band — "해결됐어요" 크림면
//
// 제보가 취재·기관 응답으로 이어진 사례. "여기 올리면 진짜 바뀝니다" — 참여의
// 효능감을 증명하는 레이어다. 항목이 없으면 섹션 자체를 렌더하지 않는다.
// 시각: 해결 크림면 #f2e6d8(유채색 면 한 곳, 잉크 13:1) 위 괘선 목록.
// 카드·필 없음. 공론장 상단(app/(public)/forum/page.tsx)에 마운트된다.
// 스타일: app/forum.css (.fo-cream*)
// ============================================================================

import type { ResolutionStory } from "./action-layer";
import "@/app/forum.css";

/** "6/12" 짧은 날짜 (null 이면 빈 문자열) */
function shortDate(value: string | null): string {
  if (!value) return "";
  // 문자열 파싱만 — 로컬 타임존 영향 없음
  const m = /^\d{4}-(\d{2})-(\d{2})/.exec(value);
  return m ? `${Number(m[1])}/${Number(m[2])}` : "";
}

function StoryRow({ story }: { story: ResolutionStory }) {
  const hasDates = story.reportedOn && story.resolvedOn;

  return (
    <li className="fo-cream-item">
      <h3>{story.title}</h3>
      {hasDates ? (
        <span className="fo-cream-dates">
          {shortDate(story.reportedOn)} 제보 → {shortDate(story.resolvedOn)} 해결
          {story.daysToResolve != null ? ` (${story.daysToResolve}일)` : ""}
        </span>
      ) : null}
      <p className="fo-cream-timeline">{story.timeline}</p>
      {story.quote ? (
        <blockquote className="fo-cream-quote">
          “{story.quote}”
          {story.quoteAuthor ? <cite>— {story.quoteAuthor}</cite> : null}
        </blockquote>
      ) : null}
    </li>
  );
}

/** 해결됐어요 크림면 — 항목 없으면 미노출 */
export function ResolutionBand({ stories }: { stories: ResolutionStory[] }) {
  if (stories.length === 0) return null;

  return (
    <section aria-labelledby="resolution-band" className="fo-cream">
      <div className="fo-cream-head">
        <h2 id="resolution-band">해결됐어요</h2>
        <span>여기 올리면 진짜 바뀝니다</span>
      </div>
      <ul className="fo-cream-list">
        {stories.map((story) => (
          <StoryRow key={story.id} story={story} />
        ))}
      </ul>
    </section>
  );
}
