// ============================================================================
// DemoAdapter — 데모 데이터 어댑터 (Core, 키 없이 동작)
//
// 광역(MBC충북·macro)·기초(옥천신문·micro) 두 매체를 시뮬레이션해
// 수집→매칭→온도→팟캐스트 전 파이프라인을 키 없이 검증한다.
//
// [데모 표식] 여기 문안은 전부 창작 데모다. 실존 인물·기관 실명을 쓰지 않고
//   (전부 가명·일반화), 실제 기사도 복제하지 않았다. 각 기사/댓글의 raw 필드에
//   { _demo: true } 표식을 넣어 실제 수집분과 구분한다.
//
// [편집 콘셉트] 같은 사안을 광역(도·예산·정책 프레임)과 기초(현장·사람 프레임)가
//   어떻게 다르게 보도하는지 대비시킨다. 10개 주제 × (광역·기초) = 20건.
//   두 제목을 나란히 읽으면 "같은 일, 다른 세계"가 느껴지도록 설계했다.
//
// [external_id 규칙] demo-mbc-<topic>(광역) / demo-oki-<topic>(기초).
//   같은 topic 이 광역↔기초 정답 매칭쌍 — scripts/report/eval-matching.ts 정답셋 시드가
//   이 규칙에 의존하므로 반드시 유지한다.
//
// 발행일은 항상 "최근(몇 시간 전)"으로 생성해 ingest 윈도우(30일)뿐 아니라
//   팟캐스트·매칭 lookback(24h)까지 모두 통과하게 한다(주제별 0~20h 분산).
//   Math.random 을 쓰지 않는 결정적 고정 데이터다.
// ============================================================================

import { region } from "@/config/region";
import type {
  MediaSourceAdapter,
  RawArticle,
  RawComment,
} from "./types";

/** 데모 문안의 지명 — 지역 설정에서 (매체명은 문안에 안 들어간다) */
const { name: PLACE, province: PROV, provinceFull: PROV_FULL } = region.place;

/**
 * 현재 기준 N시간 전 ISO.
 * 모든 데모 발행일을 24h 이내로 만들어 팟캐스트/매칭 lookback(24h)을 통과시킨다.
 * (값이 클수록 더 오래된 시각)
 */
function hoursAgoIso(hours: number): string {
  return new Date(Date.now() - hours * 3_600_000).toISOString();
}

// ---------------------------------------------------------------------------
// 광역(MBC충북) — 도·예산·정책 프레임 (보도 톤)
// 10개 주제: 교통·경제·교육·의료·행정·환경·경제·복지·문화·문화
// ---------------------------------------------------------------------------
const MACRO_ARTICLES: RawArticle[] = [
  {
    externalId: "demo-mbc-bus",
    url: "https://example.com/mbc/bus",
    title: `${PROV}도, ${PLACE} 버스 노선 개편안 발표…"대중교통 효율화"`,
    body: `${PROV_FULL}가 대중교통 효율화를 위해 ${PLACE} 지역 시내버스 노선 전면 개편안을 발표했다. 도는 중복 노선을 통합하고 배차 간격을 재조정해 연간 운영비를 절감하겠다고 밝혔다. 개편 대상은 12개 노선으로, 내년 상반기 시범 운행을 거쳐 확대할 계획이다. 도 관계자는 "수요응답형 교통을 접목해 농촌 이동권도 함께 보완하겠다"고 설명했다.`,
    category: "교통",
    keywords: ["버스", "노선개편", "대중교통", "효율화"],
    publishedAt: hoursAgoIso(9),
    raw: { _demo: true },
  },
  {
    externalId: "demo-mbc-farm",
    url: "https://example.com/mbc/farm",
    title: `${PROV}도, 농산물 직거래 활성화 대책 발표…예산 40억 편성`,
    body: `${PROV_FULL}가 지역 농가의 판로 확대를 위한 농산물 직거래 활성화 대책을 내놨다. 상설 직거래 장터를 도내 다섯 곳으로 늘리고, 온라인 판매 플랫폼 입점 수수료를 지원하는 것이 핵심이다. 도는 올해 관련 예산 40억 원을 편성했다고 밝혔다. 중간 유통 단계를 줄여 농가 소득을 높이는 것이 목표다.`,
    category: "경제",
    keywords: ["농산물", "직거래", "장터", "농가소득"],
    publishedAt: hoursAgoIso(5),
    raw: { _demo: true },
  },
  {
    externalId: "demo-mbc-school",
    url: "https://example.com/mbc/school",
    title: `${PROV}교육청, 소규모 학교 통폐합 검토 착수…대상 20여 곳`,
    body: `${PROV}교육청이 학생 수 감소에 대응해 소규모 학교 통폐합 검토에 착수했다. 전교생 30명 미만 학교를 우선 대상으로, 교육 여건 개선과 예산 효율을 명분으로 들었다. 교육청은 대상 학교 학부모 설명회를 거쳐 최종안을 확정하겠다고 밝혔다. 도내 검토 대상 학교는 20여 곳으로 파악됐다.`,
    category: "교육",
    keywords: ["교육청", "학교통폐합", "소규모학교", "학생수감소"],
    publishedAt: hoursAgoIso(2),
    raw: { _demo: true },
  },
  {
    externalId: "demo-mbc-er",
    url: "https://example.com/mbc/er",
    title: `${PROV}도, 야간 응급의료 체계 개편안 심의…"권역 중심 재편"`,
    body: `${PROV_FULL}가 야간·심야 응급의료 체계 개편안을 도의회에 상정해 심의에 들어갔다. 환자가 적은 소규모 응급실의 야간 운영을 권역 응급의료센터 중심으로 재편하는 것이 골자다. 도는 인력 부족과 운영 적자를 이유로 들며, 대신 이송 체계를 강화하겠다고 밝혔다. 개편안이 통과되면 일부 군 지역 응급실의 야간 진료가 축소된다.`,
    category: "의료",
    keywords: ["응급의료", "응급실", "야간진료", "권역센터"],
    publishedAt: hoursAgoIso(20),
    raw: { _demo: true },
  },
  {
    externalId: "demo-mbc-youth",
    url: "https://example.com/mbc/youth",
    title: `${PROV}도, 청년 정착 지원금 확대…"인구 유출 대응"`,
    body: `${PROV_FULL}가 청년 인구 유출에 대응해 정착 지원금을 대폭 확대한다고 발표했다. 지역에 3년 이상 거주하며 창업하거나 취업한 청년에게 최대 1천만 원을 단계별로 지급하는 방식이다. 도는 빈집을 리모델링한 청년 주택 공급도 함께 추진하기로 했다. 지난해 순유출된 청년이 6천여 명에 달하자 내놓은 대책이다.`,
    category: "행정",
    keywords: ["청년", "정착지원금", "인구유출", "청년주택"],
    publishedAt: hoursAgoIso(17),
    raw: { _demo: true },
  },
  {
    externalId: "demo-mbc-river",
    url: "https://example.com/mbc/river",
    title: `${PROV}도, 금강 지류 하천정비 예산 편성…"홍수 대비 120억"`,
    body: `${PROV_FULL}가 상습 침수 구간인 금강 지류 하천 정비 사업 예산을 편성했다. 제방을 높이고 배수펌프장을 증설해 여름철 홍수 피해를 줄이는 것이 목표다. 도는 국비를 포함해 총 120억 원을 투입하고 내년 착공하겠다고 밝혔다. 최근 잦아진 집중호우로 하천 범람 우려가 커진 데 따른 조치다.`,
    category: "환경",
    keywords: ["하천정비", "금강", "홍수", "제방"],
    publishedAt: hoursAgoIso(14),
    raw: { _demo: true },
  },
  {
    externalId: "demo-mbc-market",
    url: "https://example.com/mbc/market",
    title: `${PROV}도, 전통시장 온라인 전환 사업 확대…10곳 지원`,
    body: `${PROV_FULL}가 전통시장의 온라인 전환을 돕는 디지털 상권 사업을 확대한다. 시장별 온라인 주문·배송 시스템을 구축하고, 상인 대상 스마트폰 판매 교육을 지원하는 것이 핵심이다. 도는 올해 도내 열 곳의 전통시장을 대상으로 사업을 추진한다고 밝혔다. 대형 유통과 온라인 쇼핑에 밀린 전통시장의 매출을 끌어올리겠다는 구상이다.`,
    category: "경제",
    keywords: ["전통시장", "온라인전환", "디지털상권", "상인교육"],
    publishedAt: hoursAgoIso(12),
    raw: { _demo: true },
  },
  {
    externalId: "demo-mbc-care",
    url: "https://example.com/mbc/care",
    title: `${PROV}도, 방문 의료·돌봄 시범사업 확대 발표…5곳으로`,
    body: `${PROV_FULL}가 거동이 불편한 고령층을 위한 방문 의료·돌봄 시범사업을 확대한다고 발표했다. 의사와 간호사, 돌봄 인력이 한 팀을 이뤄 가정을 직접 찾아 진료와 생활 지원을 제공하는 방식이다. 도는 대상 지역을 기존 두 곳에서 다섯 곳으로 늘리기로 했다. 초고령 사회 진입에 따른 돌봄 공백을 메우기 위한 조치다.`,
    category: "복지",
    keywords: ["방문의료", "고령돌봄", "시범사업", "초고령사회"],
    publishedAt: hoursAgoIso(7),
    raw: { _demo: true },
  },
  {
    externalId: "demo-mbc-festival",
    url: "https://example.com/mbc/festival",
    title: `${PROV}도, 지역 문화제 예산 심의…"관광 활성화 기대"`,
    body: `${PROV_FULL}가 내년 지역 문화제 예산안을 도의회 심의에 올렸다. 코로나 이후 위축됐던 지역 축제를 되살려 관광객을 유치하겠다는 취지다. 도는 대표 축제를 선정해 홍보와 프로그램 운영을 집중 지원할 계획이다. 다만 일부 의원은 예산 대비 효과를 따져봐야 한다는 신중론을 제기했다.`,
    category: "문화",
    keywords: ["문화제", "축제예산", "관광활성화", "지역축제"],
    publishedAt: hoursAgoIso(15),
    raw: { _demo: true },
  },
  {
    externalId: "demo-mbc-closedschool",
    url: "https://example.com/mbc/closedschool",
    title: `${PROV}도, 유휴 폐교 문화공간 조성 사업 추진…3곳 선정`,
    body: `${PROV_FULL}가 방치된 폐교를 문화·복합 공간으로 되살리는 유휴시설 활용 사업을 추진한다. 폐교를 마을 도서관, 공방, 청년 창작 공간 등으로 리모델링해 지역에 돌려주는 것이 골자다. 도는 대상 폐교 세 곳을 선정해 설계에 들어갔다고 밝혔다. 늘어나는 유휴 시설을 지역 자산으로 전환하겠다는 구상이다.`,
    category: "문화",
    keywords: ["폐교활용", "유휴시설", "문화공간", "지역자산"],
    publishedAt: hoursAgoIso(11),
    raw: { _demo: true },
  },
];

// ---------------------------------------------------------------------------
// 기초(옥천신문) — 현장·사람 프레임 (생활 톤)
// 광역과 동일 topic 을 마을 단위·주민 인용(가명)으로 다시 본다.
// ---------------------------------------------------------------------------
const MICRO_ARTICLES: RawArticle[] = [
  {
    externalId: "demo-oki-bus",
    url: "https://example.com/oki/bus",
    title: `"새 노선, 우리 마을은 오히려 끊겼다"…${PLACE} 주민 우려`,
    body: `버스 노선 개편을 두고 ${PLACE} 외곽 마을 주민들의 불만이 커지고 있다. 안남면에 사는 김모(72) 씨는 "읍내 나가는 버스가 하루 두 대로 줄었다"며 한숨을 쉬었다. 통합 노선이 큰 도로만 지나면서 정작 마을 안쪽 정류장은 건너뛴다는 것이다. 주민들은 "효율이 아니라 우리한테는 단절"이라며 마을버스 대책을 요구했다.`,
    category: "교통",
    keywords: ["버스", "노선개편", "안남면", "마을버스"],
    publishedAt: hoursAgoIso(8.8),
    raw: { _demo: true },
  },
  {
    externalId: "demo-oki-farm",
    url: "https://example.com/oki/farm",
    title: `${PLACE} 직거래 장터 "손님은 늘었는데 일손이 없다"`,
    body: `${PLACE} 읍내 직거래 장터에 주말 방문객이 눈에 띄게 늘었지만, 정작 현장은 웃지 못하고 있다. 20년째 좌판을 지킨 박모(68) 씨는 "손님은 많은데 물건 나를 사람이 없다"고 말했다. 고령 농가가 대부분이라 새벽 준비부터 뒷정리까지 홀로 감당하는 형편이다. 상인들은 "판로도 좋지만 일손 지원이 먼저"라고 입을 모았다.`,
    category: "경제",
    keywords: ["직거래", "장터", "일손부족", "고령농가"],
    publishedAt: hoursAgoIso(4.8),
    raw: { _demo: true },
  },
  {
    externalId: "demo-oki-school",
    url: "https://example.com/oki/school",
    title: `"우리 애는 어디로 가나"…${PLACE} 학부모·동문 반발`,
    body: `소규모 학교 통폐합 검토 소식에 ${PLACE} 지역 학부모와 동문들이 강하게 반발하고 있다. 청산면의 한 학부모는 "학교가 없어지면 아이들은 매일 통학 버스에서 한 시간을 버텨야 한다"고 걱정했다. 폐교 위기에 놓인 학교의 동문회는 존치 서명운동에 들어갔다. 주민들은 "학교는 단순한 건물이 아니라 마을의 중심"이라고 호소했다.`,
    category: "교육",
    keywords: ["학교통폐합", "학부모", "청산면", "존치"],
    publishedAt: hoursAgoIso(1.8),
    raw: { _demo: true },
  },
  {
    externalId: "demo-oki-er",
    url: "https://example.com/oki/er",
    title: `"한밤중 응급실까지 한 시간"…${PLACE} 주민들 불안`,
    body: `응급실 야간 운영 축소 방침이 알려지자 ${PLACE} 주민들의 불안이 커지고 있다. 지난달 한밤중 어머니가 쓰러져 청주까지 40분을 달렸다는 이모(55) 씨는 "그 시간이 얼마나 무서운지 아느냐"고 되물었다. 고령 인구가 많은 지역 특성상 심야 응급 상황이 잦다는 것이 주민들의 걱정이다. 지역 사회단체는 "효율보다 생명이 먼저"라며 축소 철회를 요구했다.`,
    category: "의료",
    keywords: ["응급실", "야간진료", "골든타임", "고령인구"],
    publishedAt: hoursAgoIso(19.5),
    raw: { _demo: true },
  },
  {
    externalId: "demo-oki-youth",
    url: "https://example.com/oki/youth",
    title: `"일자리 없어 결국 떠난다"…${PLACE} 청년들의 고민`,
    body: `"막상 살고 싶어도 일자리가 없어요." ${PLACE}에서 나고 자란 스물여섯 이모 씨는 다음 달 청주로 이사를 준비하고 있다. 지원금 소식은 반갑지만, 정작 다닐 만한 직장이 없다는 것이 청년들의 공통된 고민이다. 카페를 창업한 한 청년은 "손님이 없어 지원금으로 버티는 것도 한계"라고 말했다. 지역 청년들은 "돈보다 일할 곳"을 먼저 꼽았다.`,
    category: "행정",
    keywords: ["청년", "일자리", "정착지원금", "인구유출"],
    publishedAt: hoursAgoIso(16.6),
    raw: { _demo: true },
  },
  {
    externalId: "demo-oki-river",
    url: "https://example.com/oki/river",
    title: `"해마다 잠기는 둑, 이번엔 될까"…${PLACE} 강변 주민들`,
    body: `장마철마다 물에 잠기는 강변 마을 주민들은 이번 정비 계획을 반신반의하고 있다. 20년 넘게 침수를 겪은 동이면의 한 주민은 "둑을 높인다는 말은 몇 번째인지 모른다"고 말했다. 지난여름에도 논밭이 흙탕물에 잠겨 한 해 농사를 통째로 잃었다는 하소연이 나온다. 주민들은 "이번엔 착공까지 꼭 지켜달라"며 조속한 추진을 당부했다.`,
    category: "환경",
    keywords: ["하천정비", "침수", "동이면", "장마"],
    publishedAt: hoursAgoIso(13.7),
    raw: { _demo: true },
  },
  {
    externalId: "demo-oki-market",
    url: "https://example.com/oki/market",
    title: `"스마트폰이 어려워서요"…${PLACE} 장터 상인들의 벽`,
    body: `온라인 판매를 배워보라는 권유에 ${PLACE} 재래시장 상인들은 설렘 반 걱정 반이다. 40년째 건어물을 파는 한 상인은 "스마트폰으로 주문받는 게 영 어렵다"며 멋쩍게 웃었다. 그래도 젊은 손님이 늘 수 있다는 기대에 교육을 신청한 상인도 적지 않다. 시장 상인회는 "손주뻘 도우미라도 붙여주면 해볼 만하다"고 반겼다.`,
    category: "경제",
    keywords: ["전통시장", "온라인판매", "상인", "디지털교육"],
    publishedAt: hoursAgoIso(11.6),
    raw: { _demo: true },
  },
  {
    externalId: "demo-oki-care",
    url: "https://example.com/oki/care",
    title: `"의사 선생님이 집까지"…${PLACE} 홀몸 어르신들 반색`,
    body: `홀로 사는 어르신들이 많은 ${PLACE} 산간 마을에 방문 의료팀 소식이 반갑게 전해졌다. 무릎이 아파 읍내 병원 가기가 큰일이던 한 어르신은 "집까지 와준다니 이런 세상이 다 있냐"며 반색했다. 그동안은 이웃의 경운기를 얻어 타고 병원에 다녀야 했다. 주민들은 "시범이라 끝나지 않고 계속 이어졌으면" 하고 바랐다.`,
    category: "복지",
    keywords: ["방문의료", "홀몸어르신", "산간마을", "돌봄"],
    publishedAt: hoursAgoIso(6.7),
    raw: { _demo: true },
  },
  {
    externalId: "demo-oki-festival",
    url: "https://example.com/oki/festival",
    title: `"올해 우리 축제는 하나요"…${PLACE} 주민들 기대 반 걱정 반`,
    body: `"올해는 우리 축제 제대로 열리나요?" ${PLACE} 주민들 사이에서 지역 문화제를 향한 기대가 부풀고 있다. 몇 해째 규모가 줄어 아쉬웠던 터라 예산 확대 소식이 반갑다는 반응이 많다. 축제 때 손칼국수를 팔던 한 주민은 "그때가 일 년 중 제일 신나는 날"이라며 웃었다. 다만 준비 인력이 부족하다며 자원봉사 모집을 걱정하는 목소리도 나왔다.`,
    category: "문화",
    keywords: ["문화제", "축제", "자원봉사", "지역행사"],
    publishedAt: hoursAgoIso(14.5),
    raw: { _demo: true },
  },
  {
    externalId: "demo-oki-closedschool",
    url: "https://example.com/oki/closedschool",
    title: `"먼지 쌓인 옛 교실, 다시 웃음소리"…${PLACE} 폐교 되살리기`,
    body: `먼지만 쌓여 있던 옛 초등학교 교실에 다시 사람 발길이 닿을 참이다. 문을 닫은 지 십수 년 된 폐교를 마을 공방으로 바꾸는 계획에 주민들은 설렘을 감추지 못했다. 이 학교를 졸업했다는 한 어르신은 "운동장에서 뛰놀던 손주들 웃음소리가 다시 들리겠다"고 말했다. 마을 청년회는 "빈 공간이 아니라 마을 사랑방으로 만들자"며 아이디어를 모으고 있다.`,
    category: "문화",
    keywords: ["폐교활용", "마을공방", "사랑방", "청년회"],
    publishedAt: hoursAgoIso(10.7),
    raw: { _demo: true },
  },
];

// ---------------------------------------------------------------------------
// 기사별 데모 댓글 (articleRef = 기사 externalId)
// 총 74개 · 기사당 3~5개. 온도계가 살아나도록 주제별 감정 비율을 다르게 설계:
//   응급의료·학교=부정 우세 / 축제·장터·돌봄=긍정 우세 / 나머지=혼합.
// 말투(존댓말·반말·짧은 탄식·긴 의견)와 닉네임(가명)을 다양화했다.
// likeCount 0~40 분포. publishedAt 은 해당 기사보다 더 최근(작은 오프셋).
// ---------------------------------------------------------------------------
const COMMENTS: Record<string, RawComment[]> = {
  // --- 1. 버스(교통) · 혼합 ---
  "demo-mbc-bus": [
    { externalId: "demo-c-bus-1", articleRef: "demo-mbc-bus", body: "노선 통합은 찬성인데 배차 간격이 관건이죠. 출퇴근 시간만이라도 늘려주세요.", authorRaw: "출근길직장인", likeCount: 14, publishedAt: hoursAgoIso(8.8) },
    { externalId: "demo-c-bus-2", articleRef: "demo-mbc-bus", body: "효율화 좋은데 외곽 주민 발은 어쩌라고요. 대책 같이 나와야 말이 되죠.", authorRaw: "청산댁", likeCount: 11, publishedAt: hoursAgoIso(8.6) },
    { externalId: "demo-c-bus-3", articleRef: "demo-mbc-bus", body: "수요응답형 버스 도입은 반갑네요. 잘 좀 굴러갔으면.", authorRaw: `${PLACE}사는사람`, likeCount: 6, publishedAt: hoursAgoIso(8.5) },
  ],
  "demo-oki-bus": [
    { externalId: "demo-c-obus-1", articleRef: "demo-oki-bus", body: "우리 마을 정류장을 건너뛴다니 말이 됩니까. 어르신들 다 걸어 나가란 소린가요.", authorRaw: "안남주민", likeCount: 22, publishedAt: hoursAgoIso(8.6) },
    { externalId: "demo-c-obus-2", articleRef: "demo-oki-bus", body: "현장 목소리 잘 담아주셨네요. 마을버스라도 놔주면 좋겠습니다.", authorRaw: "김씨아저씨", likeCount: 9, publishedAt: hoursAgoIso(8.4) },
    { externalId: "demo-c-obus-3", articleRef: "demo-oki-bus", body: "하루 두 대면 병원도 못 갑니다. 진짜 심각해요.", authorRaw: "무릎환자", likeCount: 17, publishedAt: hoursAgoIso(8.2) },
    { externalId: "demo-c-obus-4", articleRef: "demo-oki-bus", body: "그래도 큰 도로는 배차가 늘었대요. 좋아진 곳도 있긴 하네요.", authorRaw: "읍내거주", likeCount: 4, publishedAt: hoursAgoIso(8.0) },
  ],

  // --- 2. 직거래(경제) · 혼합 ---
  "demo-mbc-farm": [
    { externalId: "demo-c-farm-1", articleRef: "demo-mbc-farm", body: "직거래 장터 확대 환영합니다. 중간 마진 줄면 소비자도 좋죠.", authorRaw: "장보는엄마", likeCount: 13, publishedAt: hoursAgoIso(4.8) },
    { externalId: "demo-c-farm-2", articleRef: "demo-mbc-farm", body: "온라인 수수료 지원은 좋은데 어르신들이 쓸 수 있을지 걱정이네요.", authorRaw: "귀농3년차", likeCount: 8, publishedAt: hoursAgoIso(4.6) },
    { externalId: "demo-c-farm-3", articleRef: "demo-mbc-farm", body: "예산 40억이면 실제 농가에 얼마나 갈지 지켜봐야죠.", authorRaw: "따져보자", likeCount: 5, publishedAt: hoursAgoIso(4.5) },
  ],
  "demo-oki-farm": [
    { externalId: "demo-c-ofarm-1", articleRef: "demo-oki-farm", body: "일손 부족 진짜 심각합니다. 청년 지원이 절실해요.", authorRaw: "농부의딸", likeCount: 16, publishedAt: hoursAgoIso(4.6) },
    { externalId: "demo-c-ofarm-2", articleRef: "demo-oki-farm", body: "박씨 어르신 20년 좌판 대단하십니다. 저도 주말마다 가요.", authorRaw: "단골손님", likeCount: 11, publishedAt: hoursAgoIso(4.4) },
    { externalId: "demo-c-ofarm-3", articleRef: "demo-oki-farm", body: "판로보다 사람이 먼저라는 말, 백번 맞습니다.", authorRaw: "이웃농가", likeCount: 9, publishedAt: hoursAgoIso(4.2) },
    { externalId: "demo-c-ofarm-4", articleRef: "demo-oki-farm", body: "장터 국밥이 진짜 별미인데 앞으로도 쭉 하셨으면 좋겠어요.", authorRaw: "먹보아저씨", likeCount: 7, publishedAt: hoursAgoIso(4.0) },
  ],

  // --- 3. 학교 통폐합(교육) · 부정 우세 ---
  "demo-mbc-school": [
    { externalId: "demo-c-sch-1", articleRef: "demo-mbc-school", body: "예산 효율만 따지면 시골 학교는 다 없어집니다. 기준이 잘못됐어요.", authorRaw: "시골아빠", likeCount: 24, publishedAt: hoursAgoIso(1.9) },
    { externalId: "demo-c-sch-2", articleRef: "demo-mbc-school", body: "설명회 형식적으로 하지 말고 진짜 의견 들어주세요.", authorRaw: "학부모회장", likeCount: 15, publishedAt: hoursAgoIso(1.7) },
    { externalId: "demo-c-sch-3", articleRef: "demo-mbc-school", body: "학생 수만 볼 게 아니라 통학 안전도 봐야죠.", authorRaw: "걱정맘", likeCount: 12, publishedAt: hoursAgoIso(1.6) },
  ],
  "demo-oki-school": [
    { externalId: "demo-c-osch-1", articleRef: "demo-oki-school", body: "학교 없어지면 마을도 죽습니다. 제발 존치해주세요.", authorRaw: "청산동문", likeCount: 28, publishedAt: hoursAgoIso(1.6) },
    { externalId: "demo-c-osch-2", articleRef: "demo-oki-school", body: "통학 거리가 너무 멀어집니다. 매일 한 시간이라니 반대합니다.", authorRaw: "두아이엄마", likeCount: 19, publishedAt: hoursAgoIso(1.5) },
    { externalId: "demo-c-osch-3", articleRef: "demo-oki-school", body: "우리 애는 어디로 가나요. 생각만 해도 막막합니다.", authorRaw: "막막한부모", likeCount: 21, publishedAt: hoursAgoIso(1.3) },
    { externalId: "demo-c-osch-4", articleRef: "demo-oki-school", body: "서명운동 어디서 하나요? 저도 꼭 참여하겠습니다.", authorRaw: "동네주민", likeCount: 13, publishedAt: hoursAgoIso(1.1) },
    { externalId: "demo-c-osch-5", articleRef: "demo-oki-school", body: "작은 학교라도 선생님들 정성은 대도시 뺨쳐요. 지켜야죠.", authorRaw: "졸업생엄마", likeCount: 10, publishedAt: hoursAgoIso(0.9) },
  ],

  // --- 4. 응급의료(의료) · 부정 우세 ---
  "demo-mbc-er": [
    { externalId: "demo-c-er-1", articleRef: "demo-mbc-er", body: "적자라고 응급실 줄이면 지방 사람은 죽으란 겁니까.", authorRaw: "화난시민", likeCount: 33, publishedAt: hoursAgoIso(19.5) },
    { externalId: "demo-c-er-2", articleRef: "demo-mbc-er", body: "이송 강화한다는데 도로 사정 생각하면 말뿐일까 걱정입니다.", authorRaw: "구급차봤어요", likeCount: 18, publishedAt: hoursAgoIso(19.2) },
    { externalId: "demo-c-er-3", articleRef: "demo-mbc-er", body: "권역 센터로 몰리면 거기도 금방 포화될 텐데요.", authorRaw: "간호사입니다", likeCount: 12, publishedAt: hoursAgoIso(19.0) },
    { externalId: "demo-c-er-4", articleRef: "demo-mbc-er", body: "효율도 중요하지만 순서가 틀렸습니다. 인력부터 채워야죠.", authorRaw: "현장의목소리", likeCount: 21, publishedAt: hoursAgoIso(18.8) },
  ],
  "demo-oki-er": [
    { externalId: "demo-c-oer-1", articleRef: "demo-oki-er", body: "그 40분이 얼마나 무서운지 겪어본 사람만 압니다.", authorRaw: "가슴졸인아들", likeCount: 35, publishedAt: hoursAgoIso(19.3) },
    { externalId: "demo-c-oer-2", articleRef: "demo-oki-er", body: "우리 동네 어르신들 밤에 아프면 진짜 큰일이에요.", authorRaw: "요양보호사", likeCount: 27, publishedAt: hoursAgoIso(19.1) },
    { externalId: "demo-c-oer-3", articleRef: "demo-oki-er", body: "생명이 먼저라는 말에 백번 공감합니다. 철회하세요.", authorRaw: `${PLACE}엄마`, likeCount: 24, publishedAt: hoursAgoIso(18.9) },
    { externalId: "demo-c-oer-4", articleRef: "demo-oki-er", body: "청주까지 실려가다 골든타임 놓치면 누가 책임집니까.", authorRaw: "분노한주민", likeCount: 29, publishedAt: hoursAgoIso(18.7) },
    { externalId: "demo-c-oer-5", articleRef: "demo-oki-er", body: "그래도 이송 체계라도 확실히 해주면 조금은 낫겠죠.", authorRaw: "현실적인생각", likeCount: 6, publishedAt: hoursAgoIso(18.5) },
  ],

  // --- 5. 청년 정착(행정) · 혼합(부정 기움) ---
  "demo-mbc-youth": [
    { externalId: "demo-c-yth-1", articleRef: "demo-mbc-youth", body: "지원금도 좋지만 결국 일자리가 있어야 남죠.", authorRaw: "취준생", likeCount: 20, publishedAt: hoursAgoIso(16.6) },
    { externalId: "demo-c-yth-2", articleRef: "demo-mbc-youth", body: "빈집 리모델링 청년주택 아이디어는 괜찮네요. 실행이 관건.", authorRaw: "귀향고민중", likeCount: 11, publishedAt: hoursAgoIso(16.4) },
    { externalId: "demo-c-yth-3", articleRef: "demo-mbc-youth", body: "3년 거주 조건이 좀 빡세네요. 문턱 낮춰주세요.", authorRaw: "이제막정착", likeCount: 8, publishedAt: hoursAgoIso(16.2) },
  ],
  "demo-oki-youth": [
    { externalId: "demo-c-oyth-1", articleRef: "demo-oki-youth", body: "돈보다 일할 곳이 먼저라는 말, 진짜 공감합니다.", authorRaw: "떠나는청년", likeCount: 22, publishedAt: hoursAgoIso(16.3) },
    { externalId: "demo-c-oyth-2", articleRef: "demo-oki-youth", body: "저도 결국 청주로 갑니다. 여기선 답이 없어서요.", authorRaw: "스물여섯", likeCount: 17, publishedAt: hoursAgoIso(16.1) },
    { externalId: "demo-c-oyth-3", articleRef: "demo-oki-youth", body: "그래도 남아서 카페 하는 분들 응원합니다. 자주 갈게요.", authorRaw: "동네주민B", likeCount: 13, publishedAt: hoursAgoIso(15.9) },
    { externalId: "demo-c-oyth-4", articleRef: "demo-oki-youth", body: "청년 창업 지원 조금만 더 세심했으면. 버티기가 힘드네요.", authorRaw: "3년차사장", likeCount: 9, publishedAt: hoursAgoIso(15.7) },
  ],

  // --- 6. 하천정비(환경) · 혼합(부정 기움) ---
  "demo-mbc-river": [
    { externalId: "demo-c-riv-1", articleRef: "demo-mbc-river", body: "제방 높이는 것도 좋지만 상류 관리가 더 중요합니다.", authorRaw: "물길연구", likeCount: 14, publishedAt: hoursAgoIso(13.7) },
    { externalId: "demo-c-riv-2", articleRef: "demo-mbc-river", body: "120억 들여서 이번엔 제대로 좀 해주세요.", authorRaw: "강변주민", likeCount: 10, publishedAt: hoursAgoIso(13.5) },
    { externalId: "demo-c-riv-3", articleRef: "demo-mbc-river", body: "착공이 내년이면 올여름은 또 어쩌라고요.", authorRaw: "장마걱정", likeCount: 12, publishedAt: hoursAgoIso(13.3) },
  ],
  "demo-oki-river": [
    { externalId: "demo-c-oriv-1", articleRef: "demo-oki-river", body: "둑 높인다는 말, 진짜 몇 번째인지 모르겠습니다.", authorRaw: "동이면농부", likeCount: 19, publishedAt: hoursAgoIso(13.5) },
    { externalId: "demo-c-oriv-2", articleRef: "demo-oki-river", body: "작년에 논 다 잠겼어요. 이번엔 꼭 지켜주세요.", authorRaw: "물난리겪음", likeCount: 16, publishedAt: hoursAgoIso(13.3) },
    { externalId: "demo-c-oriv-3", articleRef: "demo-oki-river", body: "배수펌프장 증설된다니 그나마 다행입니다.", authorRaw: "강마을청년", likeCount: 8, publishedAt: hoursAgoIso(13.1) },
    { externalId: "demo-c-oriv-4", articleRef: "demo-oki-river", body: "말만 말고 착공식 날짜부터 잡읍시다.", authorRaw: "성난주민", likeCount: 11, publishedAt: hoursAgoIso(12.9) },
  ],

  // --- 7. 전통시장 온라인(경제) · 긍정 우세 ---
  "demo-mbc-market": [
    { externalId: "demo-c-mkt-1", articleRef: "demo-mbc-market", body: "전통시장 온라인 전환, 좋은 시도네요. 응원합니다.", authorRaw: "온라인쇼핑족", likeCount: 15, publishedAt: hoursAgoIso(11.6) },
    { externalId: "demo-c-mkt-2", articleRef: "demo-mbc-market", body: "상인 교육 제대로만 되면 매출에 도움 되겠어요.", authorRaw: "시장사랑", likeCount: 10, publishedAt: hoursAgoIso(11.4) },
    { externalId: "demo-c-mkt-3", articleRef: "demo-mbc-market", body: "배송 시스템이 관건인데 잘 굴러갈지 지켜볼게요.", authorRaw: "지켜보는중", likeCount: 6, publishedAt: hoursAgoIso(11.2) },
  ],
  "demo-oki-market": [
    { externalId: "demo-c-omkt-1", articleRef: "demo-oki-market", body: "우리 시장 상인분들 파이팅! 온라인으로도 꼭 사먹을게요.", authorRaw: "건어물단골", likeCount: 21, publishedAt: hoursAgoIso(11.4) },
    { externalId: "demo-c-omkt-2", articleRef: "demo-oki-market", body: "손주뻘 도우미 붙여준다니 어르신들 든든하겠네요.", authorRaw: "이웃사촌", likeCount: 14, publishedAt: hoursAgoIso(11.2) },
    { externalId: "demo-c-omkt-3", articleRef: "demo-oki-market", body: "스마트폰 어려워도 배우면 되죠. 상인회 화이팅입니다.", authorRaw: "청년봉사단", likeCount: 12, publishedAt: hoursAgoIso(11.0) },
    { externalId: "demo-c-omkt-4", articleRef: "demo-oki-market", body: "교육받는다고 다 되나요. 배송 사고 안 나게 관리가 중요해요.", authorRaw: "냉정한손님", likeCount: 5, publishedAt: hoursAgoIso(10.8) },
  ],

  // --- 8. 방문 돌봄(복지) · 긍정 우세 ---
  "demo-mbc-care": [
    { externalId: "demo-c-care-1", articleRef: "demo-mbc-care", body: "방문 의료 확대 정말 필요한 정책입니다. 환영해요.", authorRaw: "요양가족", likeCount: 17, publishedAt: hoursAgoIso(6.7) },
    { externalId: "demo-c-care-2", articleRef: "demo-mbc-care", body: "인력이 충분할지가 걱정이네요. 팀당 부담 크지 않게 해주세요.", authorRaw: "간호대생", likeCount: 9, publishedAt: hoursAgoIso(6.5) },
    { externalId: "demo-c-care-3", articleRef: "demo-mbc-care", body: "시범으로 끝내지 말고 전 지역으로 넓혔으면 합니다.", authorRaw: "복지관심", likeCount: 12, publishedAt: hoursAgoIso(6.3) },
  ],
  "demo-oki-care": [
    { externalId: "demo-c-ocare-1", articleRef: "demo-oki-care", body: "우리 마을 어르신들 병원 가기 얼마나 힘든데. 정말 반가운 소식이에요.", authorRaw: "산골며느리", likeCount: 23, publishedAt: hoursAgoIso(6.5) },
    { externalId: "demo-c-ocare-2", articleRef: "demo-oki-care", body: "집까지 와준다니 세상 참 좋아졌네요. 계속 이어졌으면.", authorRaw: "홀몸어르신딸", likeCount: 15, publishedAt: hoursAgoIso(6.3) },
    { externalId: "demo-c-ocare-3", articleRef: "demo-oki-care", body: "경운기 얻어 타고 병원 다니셨다니 마음이 아프네요.", authorRaw: "옆동네주민", likeCount: 10, publishedAt: hoursAgoIso(6.1) },
    { externalId: "demo-c-ocare-4", articleRef: "demo-oki-care", body: "시범 끝나면 또 없어지는 거 아닌지 그게 걱정입니다.", authorRaw: "현실걱정", likeCount: 7, publishedAt: hoursAgoIso(5.9) },
  ],

  // --- 9. 지역 문화제(문화) · 긍정 우세 ---
  "demo-mbc-festival": [
    { externalId: "demo-c-fest-1", articleRef: "demo-mbc-festival", body: "축제 되살리는 거 찬성입니다. 지역 경제에 도움 되죠.", authorRaw: "관광객유치", likeCount: 13, publishedAt: hoursAgoIso(14.5) },
    { externalId: "demo-c-fest-2", articleRef: "demo-mbc-festival", body: "예산 대비 효과 따지자는 말도 일리는 있어요.", authorRaw: "합리적시민", likeCount: 8, publishedAt: hoursAgoIso(14.3) },
    { externalId: "demo-c-fest-3", articleRef: "demo-mbc-festival", body: "대표 축제 선정 기준이 공정했으면 합니다.", authorRaw: "다른지역도", likeCount: 6, publishedAt: hoursAgoIso(14.1) },
  ],
  "demo-oki-festival": [
    { externalId: "demo-c-ofest-1", articleRef: "demo-oki-festival", body: "드디어! 우리 축제 제대로 열리는 건가요. 벌써 설레네요.", authorRaw: "축제기다림", likeCount: 26, publishedAt: hoursAgoIso(14.3) },
    { externalId: "demo-c-ofest-2", articleRef: "demo-oki-festival", body: "손칼국수 어르신 올해도 나오시죠? 그거 먹으러 갑니다.", authorRaw: "단골관람객", likeCount: 18, publishedAt: hoursAgoIso(14.1) },
    { externalId: "demo-c-ofest-3", articleRef: "demo-oki-festival", body: "일 년 중 제일 신나는 날 맞아요. 온 가족이 기다립니다.", authorRaw: "세아이아빠", likeCount: 15, publishedAt: hoursAgoIso(13.9) },
    { externalId: "demo-c-ofest-4", articleRef: "demo-oki-festival", body: "자원봉사 모집하면 저 신청할게요. 같이 만들어요!", authorRaw: "봉사하고파", likeCount: 12, publishedAt: hoursAgoIso(13.7) },
    { externalId: "demo-c-ofest-5", articleRef: "demo-oki-festival", body: "좋긴 한데 준비 인력이 늘 부족해요. 이건 대책이 필요합니다.", authorRaw: "축제스태프", likeCount: 7, publishedAt: hoursAgoIso(13.5) },
  ],

  // --- 10. 폐교 활용(문화) · 긍정 우세 ---
  "demo-mbc-closedschool": [
    { externalId: "demo-c-cls-1", articleRef: "demo-mbc-closedschool", body: "폐교 활용 정말 좋은 방향이에요. 방치보다 백배 낫죠.", authorRaw: "빈집걱정", likeCount: 14, publishedAt: hoursAgoIso(10.7) },
    { externalId: "demo-c-cls-2", articleRef: "demo-mbc-closedschool", body: "도서관, 공방 좋은데 운영 인력과 예산이 계속 갈지가 관건.", authorRaw: "현실주의자", likeCount: 9, publishedAt: hoursAgoIso(10.5) },
    { externalId: "demo-c-cls-3", articleRef: "demo-mbc-closedschool", body: "청년 창작 공간 아이디어 신선하네요. 응원합니다.", authorRaw: "예술청년", likeCount: 8, publishedAt: hoursAgoIso(10.3) },
  ],
  "demo-oki-closedschool": [
    { externalId: "demo-c-ocls-1", articleRef: "demo-oki-closedschool", body: "먼지 쌓인 옛 교실이 다시 살아난다니 괜히 눈물나네요.", authorRaw: "졸업생60년", likeCount: 20, publishedAt: hoursAgoIso(10.5) },
    { externalId: "demo-c-ocls-2", articleRef: "demo-oki-closedschool", body: "손주들 웃음소리 다시 들리겠다는 말에 마음이 뭉클합니다.", authorRaw: "마을할머니", likeCount: 16, publishedAt: hoursAgoIso(10.3) },
    { externalId: "demo-c-ocls-3", articleRef: "demo-oki-closedschool", body: "마을 사랑방으로 만들자는 청년회 응원합니다. 저도 손 보탤게요.", authorRaw: "귀촌청년", likeCount: 13, publishedAt: hoursAgoIso(10.1) },
    { externalId: "demo-c-ocls-4", articleRef: "demo-oki-closedschool", body: "좋은데 관리비는 누가 내나요. 열어놓고 방치되면 더 흉해요.", authorRaw: "냉정모드", likeCount: 6, publishedAt: hoursAgoIso(9.9) },
  ],
};

/** 데모 어댑터 팩토리 — 외부 호출 없음 */
function makeDemoAdapter(
  id: string,
  tier: "macro" | "micro",
  articles: RawArticle[],
): MediaSourceAdapter {
  return {
    id,
    tier,
    async fetchArticles(since: Date): Promise<RawArticle[]> {
      // since 이후 기사만 (멱등 수집 테스트용) — 발행일이 항상 최근이라 통과
      return articles.filter(
        (a) => new Date(a.publishedAt).getTime() >= since.getTime(),
      );
    },
    async fetchComments(articleRef: string): Promise<RawComment[]> {
      return COMMENTS[articleRef] ?? [];
    },
  };
}

/** 광역(MBC충북) 데모 — tier macro → media_source 'mbc_cb' */
export const DemoMbcAdapter = makeDemoAdapter("demo_mbc", "macro", MACRO_ARTICLES);
/** 기초(옥천신문) 데모 — tier micro → media_source 'okinews' */
export const DemoOkiAdapter = makeDemoAdapter("demo_oki", "micro", MICRO_ARTICLES);

/** 하위호환 별칭 (광역) */
export const DemoAdapter = DemoMbcAdapter;
