// ============================================================================
// config/region — 지역판 설정의 단일 출처 (2026-10-26, #184 "지역 설정 분리")
//
// 다른 지역(다른 광역 방송 × 기초 신문)이 ZONE-2 를 가져다 쓸 때 **이 파일 하나**를 바꾸면 되도록,
// 매체명·지명·코너명·링크·로고·재단 표기처럼 "옥천판"에만 해당하는 값을 코드에서 빼 여기에 둔다.
//
// 바꾸지 않는 것(식별자): DB 에 저장되는 source id("mbc_cb"·"okinews"·"oc_gov"), 확인 기관 키("mbc"·"okinews"),
// 역할 이름("operator_mbc"·"operator_oki"). 이들은 데이터와 마이그레이션에 박힌 키라 다른 지역판도 그대로 쓰고
// 표시 이름만 여기서 바꾼다(예: macro.name="KBS전주", micro.name="진안신문").
//
// 사용: import { region, outletBySource, orgLabel } from "@/config/region";
// 서버·클라이언트 공용(비밀값 없음). 환경변수로 덮을 수 있는 것은 NEXT_PUBLIC_SITE_URL 하나뿐.
// ============================================================================

import type { MediaSource } from "@/types";

/** 확인 기관 키 — lib/auth/roles AdminOrg 와 같은 값(이 파일이 types 보다 아래에 있지 않도록 문자열로 둔다) */
export type OutletOrg = "okinews" | "mbc";

export interface OutletConfig {
  /** DB source id — 바꾸지 않는다 */
  source: MediaSource;
  /** 이중 컨펌 기관 키 — 바꾸지 않는다 */
  org: OutletOrg;
  /** 표시 이름 */
  name: string;
  /** 짧은 이름(칩·좁은 칸) */
  shortName: string;
  /** 계층 라벨 — 광역/기초 */
  tier: "광역" | "기초";
  /** 매체 성격 — 아이콘·"방송/지면" 라벨 */
  kind: "broadcast" | "paper";
  /** 공식 홈 */
  url: string;
  /** 로고(public/) — 종이 위 */
  logo: string;
  /** 발행 주기 설명(팟캐 대본·검수 화면에 쓰는 한 마디). 매일이면 빈 문자열 */
  cadenceNote: string;
}

export const region = {
  /** 서비스 */
  site: {
    name: "ZONE-2",
    tagline: "Two lenses, one story",
    /** 한 줄 설명(메타·OG·RSS) */
    description: "광역 방송(MBC충북)과 기초 신문(옥천신문)이 같은 사안을 어떻게 다르게 보도하는지 나란히 보여 주고, 주민 여론을 공론장으로 잇는 지역 뉴스 서비스",
    /** 짧은 설명(홈 OG 제목 등) */
    shortDescription: "MBC충북과 옥천신문, 광역과 기초 두 시선을 한 사안으로 잇는 지역 공론장",
    url: process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://mbcok.com",
    lang: "ko",
    locale: "ko_KR",
    /** 홈 진입 인트로(캔버스 컨셉 영상, components/reels/concept-video). 공개 리포에는 그 코드가 없어 false 로 내보낸다 */
    intro: false as boolean, // 공개 리포: 컨셉 영상 코드 미포함
    /** 브랜드 영상(public/brand). null 이면 "브랜드 영상 보기" 버튼을 그리지 않는다 — 영상은 공개 리포에 포함하지 않는다 */
    brandVideo: null as string | null, // 공개 리포: 브랜드 영상 미포함
  },

  /** 지역 */
  place: {
    /** 기초 지명 — "오늘의 옥천", "옥천 소식" */
    name: "옥천",
    /** 기초 행정구역 — 군청 공고·JSON-LD */
    county: "옥천군",
    /** 광역 지명 — "오늘의 충북" */
    province: "충북",
    provinceFull: "충청북도",
    /** 구조화 데이터 areaServed */
    areaServed: "충청북도 옥천군",
    /** 광역 매체 영상 중 "지역 소식" 판정에 쓰는 지명·표식(lib/podcast/regional) — 광역권 전체 */
    regionWords: [
      "충북", "충청", "청주", "충주", "제천", "옥천", "보은", "영동", "증평", "진천", "괴산", "음성", "단양",
      "도내", "도청", "오송", "오창", "월악산", "속리산", "충청권", "청풍", "단양군", "영동군", "보은군",
    ],
  },

  /** 두 매체 */
  outlets: {
    macro: {
      source: "mbc_cb",
      org: "mbc",
      name: "MBC충북",
      shortName: "MBC충북",
      tier: "광역",
      kind: "broadcast",
      url: "https://www.mbccb.co.kr",
      logo: "/logos/mbc-chungbuk.png",
      cadenceNote: "",
    } satisfies OutletConfig,
    micro: {
      source: "okinews",
      org: "okinews",
      name: "옥천신문",
      shortName: "옥천신문",
      tier: "기초",
      kind: "paper",
      url: "https://www.okinews.com",
      logo: "/logos/okcheon.png",
      /** 주간지 — 대본에서 "다음 발행(목·금)" 안내에 쓴다 */
      cadenceNote: "목·금",
    } satisfies OutletConfig,
  },

  /** 공고 출처(지자체) */
  government: {
    source: "oc_gov",
    name: "옥천군청",
    noticesLabel: "옥천군청 공고",
  },

  /** 팟캐스트 */
  podcast: {
    /** 시리즈 이름 — "오늘의 충북 10월 30일" */
    seriesName: "오늘의 충북",
    seriesSub: "AI 오디오 브리핑",
    /** 기초 코너 — 대본 구조의 고정 코너 */
    localCorner: "오늘의 옥천",
    /** 기초 코너 첫 문장(대본 규칙) */
    localCornerLead: "이어서 오늘의 옥천 소식입니다.",
  },

  /** 컨소시엄·재단 표기 */
  consortium: {
    label: "MBC충북 × 옥천신문",
    copyright: "MBC충북 · 옥천신문",
  },
  funder: {
    name: "한국언론진흥재단",
    /** 투명 배경 공식 CI(public/logos). 재단 CI 는 재배포 불가 상표라 공개 리포에서는 null — 그때는 이름 글자로 표기한다 */
    ci: null as string | null, // 공개 리포: 재단 CI(상표) 미포함
    /** "본 서비스는 [CI]의 지원을 받아 개발되었습니다." — 세 조각(CI 이미지가 가운데 들어간다) */
    sentence: ["본 서비스는", "의", "지원을 받아 개발되었습니다."] as const,
    program: "한국언론진흥재단 2026 디지털 미디어 개발 지원사업",
  },
} as const;

export type RegionConfig = typeof region;

/** source id → 매체 설정 */
export function outletBySource(source: MediaSource | string | null | undefined): OutletConfig | null {
  if (source === region.outlets.macro.source) return region.outlets.macro;
  if (source === region.outlets.micro.source) return region.outlets.micro;
  return null;
}

/** 확인 기관 키 → 매체 설정 */
export function outletByOrg(org: OutletOrg | string | null | undefined): OutletConfig | null {
  if (org === region.outlets.macro.org) return region.outlets.macro;
  if (org === region.outlets.micro.org) return region.outlets.micro;
  return null;
}

/** 매체 표시 이름(모르면 source 그대로) */
export function sourceLabel(source: MediaSource | string): string {
  return outletBySource(source)?.name ?? String(source);
}

/** 기관 표시 이름(모르면 org 그대로) */
export function orgLabel(org: OutletOrg | string): string {
  return outletByOrg(org)?.name ?? String(org);
}

/** "광역 · MBC충북" 같은 계층+이름 */
export function tierLabel(source: MediaSource | string): string {
  const o = outletBySource(source);
  return o ? `${o.tier} · ${o.name}` : String(source);
}

/** 확인 기관 키 목록(순서 고정: 기초 → 광역) — 이중 컨펌 칩·판정에 쓴다 */
export const OUTLET_ORGS: readonly OutletOrg[] = [region.outlets.micro.org, region.outlets.macro.org];
