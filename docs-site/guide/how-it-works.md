<script setup>
// 동작원리 도식 데이터 — 라벨/설명 문구는 원본과 동일하게 유지.
const pipelineStages = [
  { label: "수집", nodes: [
    { icon: "📰", title: "옥천신문" },
    { icon: "📺", title: "MBC충북" },
    { icon: "💬", title: "여론광장" },
    { icon: "📢", title: "옥천군청 공고" },
  ] },
  { nodes: [ { icon: "🧮", title: "정규화 · 임베딩" } ] },
  { nodes: [ { icon: "🗄️", title: "기사 · 여론 · 공고" } ] },
  { nodes: [
    { icon: "🔀", title: "크로스뷰 매칭" },
    { icon: "🌡️", title: "온도 산출" },
    { icon: "🎧", title: "팟캐스트 생성" },
  ] },
  { nodes: [ { icon: "🌐", title: "mbcok.com", tone: "brand" } ] },
];

const tempStages = [
  { nodes: [ { icon: "💬", title: "주민 여론", note: "(댓글 · 여론광장 글)" } ] },
  { nodes: [ { icon: "🔎", title: "이슈 키워드와 본문 매칭" } ] },
  { via: "매칭된 여론", nodes: [ { icon: "🧺", title: "이슈별 여론 묶음" } ] },
  { nodes: [
    { icon: "①", title: "빈도", note: "(최근일수록 가중 · 시간감쇠)" },
    { icon: "②", title: "감정 분산", note: "(찬반이 갈릴수록 ↑)" },
    { icon: "③", title: "토픽 집중도", note: "(키워드 쏠림 · HHI)" },
  ] },
  { nodes: [ { icon: "📐", title: "이슈 간 정규화", note: "(Min-Max)" } ] },
  { nodes: [ { icon: "🌡️", title: "온도 = 세 성분 가중합", tone: "brand" } ] },
  { nodes: [ { icon: "🎨", title: "5구간 색상 표시" } ] },
];

const tempBands = [
  { key: "b1", name: "잠잠", range: "0–19" },
  { key: "b2", name: "미온", range: "20–39" },
  { key: "b3", name: "보통", range: "40–59" },
  { key: "b4", name: "뜨거움", range: "60–79" },
  { key: "b5", name: "매우뜨거움", range: "80–100" },
];

const crossviewStages = [
  { nodes: [ { icon: "📄", title: "기준 기사", note: "(예: 옥천신문)" } ] },
  { nodes: [ { icon: "🧭", title: "임베딩 유사도", note: "Top-N 후보" } ] },
  { nodes: [ { icon: "🔧", title: "필터", bullets: ["발행일 근접", "키워드 교집합", "지면 인덱스 페이지 제외"] } ] },
  { nodes: [ { icon: "🧩", title: "후보 쌍" } ] },
  { nodes: [ { icon: "✅", title: "정제 · 승인" } ] },
  { via: "approved", nodes: [ { icon: "🔀", title: "크로스뷰 카드", note: "(광역 + 기초 + 리딩포인트)", tone: "brand" } ] },
];
</script>

# 동작 원리

ZONE-2가 데이터를 어떻게 수집하고 콘텐츠로 바꾸는지 도식으로 설명합니다.

## 전체 파이프라인

<FlowDiagram :stages="pipelineStages" label="전체 파이프라인 흐름도" />

각 단계는 launchd 크론으로 **자동** 실행됩니다. → [운영](/guide/operations)

## 🌡️ 공론 온도계 — 어떻게 계산하나

주민 여론이 이슈별로 얼마나 뜨거운지를 **0~100 온도**로 나타냅니다.

<FlowDiagram :stages="tempStages" label="공론 온도 계산 흐름도" />

### 세 가지 신호

| 성분 | 의미 | 직관 |
|------|------|------|
| **빈도** | 여론이 얼마나 많이·최근에 달렸나 | 많고 최신일수록 뜨겁다 |
| **감정 분산** | 찬반이 얼마나 갈리나 | 논쟁적일수록 뜨겁다 |
| **토픽 집중도** | 특정 키워드에 쏠렸나 | 한 지점에 몰릴수록 뜨겁다 |

### 온도 구간

<TempBands :bands="tempBands" />

::: tip 여론이 적으면 온도도 낮다
온도는 실제 여론 신호에만 기반합니다(가짜 가중 없음). 표본이 적으면 낮게 나오는 게 정상이며, 여론 수집 소스를 넓히면 신호가 풍부해집니다.
:::

## 🔀 크로스뷰 매칭 — 같은 사안 찾기

광역·기초 기사 중 **같은 사안을 다룬 쌍**을 찾습니다.

<FlowDiagram :stages="crossviewStages" label="크로스뷰 매칭 흐름도" />

"NNNN호 지면 보기" 같은 본문 없는 목차 페이지는 후보 단계에서 제외해, 요약이 제목 반복으로 퇴화하는 것을 막습니다.
