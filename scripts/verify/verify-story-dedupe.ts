// ============================================================================
// scripts/verify/verify-story-dedupe — #188 회귀 검사(순수 함수, DB 없음). 실행: pnpm tsx scripts/verify/verify-story-dedupe.ts
// ============================================================================
import { collapseSameStoryCandidates, sameStory, storyKey } from "../../lib/matching/story";
import type { MatchCandidate } from "../../lib/matching/types";
import type { Article } from "../../types";

let fails = 0;
function check(name: string, ok: boolean): void {
  console.log(`${ok ? "✓" : "✗"} ${name}`);
  if (!ok) fails += 1;
}

const T = '국민의힘 장동혁 당대표 고 육영수 여사 생가 방문.. "역사·문화전쟁 맞서 싸울 것"';
check("같은 제목 → 같은 story", sameStory(T, T));
check("머리표·공백 차이 무시", sameStory("(종합) 옥천 마암과선교 이달 말까지 전면 통제", "옥천 마암과선교 이달말까지 전면통제"));
check("짧은 제목은 판정 안 함", storyKey("옥천군") === null && !sameStory("R)", "R)"));
check("다른 제목", !sameStory("농어촌 기본소득 탈락", "농어촌 기본소득 탈락 전국 5개 군 반발 확산"));

const art = (id: string, kind: string, title: string): Article =>
  ({ id, source: "mbc_cb", kind, title, body: "", url: "", externalId: id, publishedAt: null, category: null, keywords: [], embedding: null, raw: null, createdAt: "" }) as unknown as Article;
const cands: MatchCandidate[] = [
  { article: art("yt", "youtube", T), similarity: 0.9 },
  { article: art("news", "news", T), similarity: 0.8 },
  { article: art("other", "news", "충북 정부 예산 사상 첫 10조 원 시대 개막"), similarity: 0.7 },
];
const out = collapseSameStoryCandidates(cands);
check("같은 story 뉴스+유튜브 → 뉴스 1건만", out.length === 2 && out.some((c) => c.article.id === "news") && !out.some((c) => c.article.id === "yt"));
check("다른 story 는 유지·유사도 내림차순", out[0].article.id === "news" && out[1].article.id === "other");

if (fails > 0) {
  console.error(`실패 ${fails}건`);
  process.exit(1);
}
console.log("모두 통과");
