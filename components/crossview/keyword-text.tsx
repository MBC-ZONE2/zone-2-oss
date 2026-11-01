// ============================================================================
// components/crossview/keyword-text — 시그니처 「교집합 낱말만 잉크 700」
//
// 양쪽 기사 keywords 교집합에 든 낱말은 <strong class="cvp-kw">(잉크 700), 나머지는
// 부모의 보조 잉크(#5b6170, 400)로 둔다. 색이 아니라 무게로 만드는 대조.
// 큰글씨 모드(html[data-font-size=large])는 CSS 가 밑줄을 더한다.
// 서버/클라 공용(훅 없음). 스타일: app/crossview.css
// ============================================================================

import { segmentByKeywords } from "./text";

export function KeywordText({
  text,
  keywords,
}: {
  text: string;
  /** 교집합 낱말(keywordIntersection 결과). 비어 있으면 그대로 출력 */
  keywords: readonly string[];
}) {
  const segs = segmentByKeywords(text, keywords);
  return (
    <>
      {segs.map((s, i) =>
        s.hit ? (
          <strong key={i} className="cvp-kw">
            {s.text}
          </strong>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </>
  );
}
