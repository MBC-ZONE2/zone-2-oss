// ============================================================================
// components/seo/json-ld — <script type="application/ld+json"> 한 장 (서버 컴포넌트)
// "<" 를 < 로 바꿔 </script> 조기 종료를 막는다(Next 공식 가이드와 같은 방식).
// ============================================================================

export function JsonLd({ data }: { data: object | object[] }) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
