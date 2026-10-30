// ============================================================================
// lib/podcast/regional — MBC충북 유튜브 항목의 지역성 판정 (#166 후속, 2026-09-28)
//
// MBC충북 유튜브 채널(uploads)에는 지역 뉴스 외에 전국 정치 클립(대통령 순방·여야 최고위원회의·
// 재판 반응 등)과 라이브 스트림이 섞여 올라온다. 대본 재료는 지역 소식이어야 하므로 걸러 낸다.
// 채널·재생목록 정보는 저장하지 않으니(raw: outlet·kind·videoId·thumbnail) 제목·설명(body)으로 판정한다.
//
// 실측(9월): 두 가지 설명 템플릿이 뚜렷하다.
//   · 지역 뉴스  — "#충북 #MBC #공영방송 #로컬뉴스 #충북인" 해시태그, 또는 방송 대본("◀ 앵 커 ▶ … 기자입니다")
//   · 전국 클립  — "*MBC충북에 제보하는 법 …" 안내문 + 인물 해시태그(#이재명 #김민석 #김건희 …)
// 규칙(위에서부터 먼저 맞는 것):
//   1) 라이브·다시보기 → 제외
//   2) 설명에 지역 뉴스 표식(#로컬뉴스, 앵커/리포트 대본) → 지역
//   3) 설명이 제보 안내문 템플릿이고 제목에 충북 지명이 없음 → 전국 클립, 제외
//   4) 제목·설명에 충북 지명 → 지역
//   5) 제목에 전국 정치 낱말(대통령·국회·여야·장관·재판…) → 제외
//   6) 그 외 → 지역(보수적으로 남긴다 — 놓치는 것보다 섞이는 게 낫다)
// 순수 함수 — DB·네트워크 없음. 판정 이유를 함께 돌려 로그·검증에 쓴다.
// ============================================================================

import { region } from "@/config/region";
import type { Article } from "@/types";

/** 정규식 메타문자 이스케이프 — 설정의 지명·매체명을 패턴에 넣을 때 */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 라이브·전체 다시보기 — 기사가 아니다 (한국어 표현 휴리스틱 — 지역 설정과 무관, 언어 종속) */
export const NON_STORY_RE = /다시보기|\[\s*🔴?\s*(?:이 시각\s*)?LIVE\s*\]|실시간 스트리밍|생방송/;

/** 충북 지명·지역 표식 — 이 중 하나라도 있으면 지역 소식으로 본다 */
const REGION_RE = new RegExp(region.place.regionWords.map(escapeRegExp).join("|"));

/** 지역 뉴스 설명 표식 (한국어 방송 대본 표식 휴리스틱 — 언어 종속) */
const LOCAL_MARK_RE = /#로컬뉴스|#충북인|◀\s*앵\s*커\s*▶|◀\s*리포트\s*▶|기자입니다|기자의 보도|기자가 (?:취재|전해|보도)/;

/** 전국 클립 설명 템플릿 — 제보 안내문으로 시작 */
const NATIONAL_TEMPLATE_RE = new RegExp(`^\\s*\\*?\\s*${escapeRegExp(region.outlets.macro.name)}에\\s+제보하는 법`);

/** 제목의 전국 정치 낱말 — 지명이 없을 때만 본다 (한국 전국 정치 어휘 휴리스틱 — 언어·국가 종속) */
const NATIONAL_RE =
  /대통령|청와대|국회|여야|여당|야당|더불어민주당|국민의힘|민주당|최고위원|당대표|원내대표|장관|총리|검찰총장|헌재|헌법재판|대법원|특검|탄핵|순방|정상회담|김건희|윤석열|이재명|김민석|장동혁/;

export type RegionalVerdict = {
  regional: boolean;
  /** 어느 규칙이 결정했는지 — 로그·검증용 */
  reason: "live" | "local-mark" | "national-template" | "region-word" | "national-word" | "default";
};

/** MBC충북 항목이 지역 소식인지. news(CMS) 는 전부 지역이라 유튜브만 규칙을 탄다 */
export function judgeRegional(a: Pick<Article, "source" | "kind" | "title" | "body">): RegionalVerdict {
  if (a.source !== region.outlets.macro.source || a.kind !== "youtube") return { regional: true, reason: "default" };
  const title = a.title ?? "";
  const body = a.body ?? "";
  if (NON_STORY_RE.test(title)) return { regional: false, reason: "live" };
  if (LOCAL_MARK_RE.test(body)) return { regional: true, reason: "local-mark" };
  if (NATIONAL_TEMPLATE_RE.test(body) && !REGION_RE.test(title)) return { regional: false, reason: "national-template" };
  if (REGION_RE.test(title) || REGION_RE.test(body)) return { regional: true, reason: "region-word" };
  if (NATIONAL_RE.test(title)) return { regional: false, reason: "national-word" };
  return { regional: true, reason: "default" };
}

/** 대본 재료로 쓸 수 있는 MBC충북 항목인가 */
export function isRegionalStory(a: Pick<Article, "source" | "kind" | "title" | "body">): boolean {
  return judgeRegional(a).regional;
}
