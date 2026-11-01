// ============================================================================
// 어댑터 레지스트리 (config 주입 지점)
//
// docs/06 §1: Deploy 단계에서 실제 어댑터(MbcAdapter·OkinewsAdapter)를 등록한다.
// Phase 0 에서는 DemoAdapter 만 등록되어 있다.
// ============================================================================

import type { MediaSourceAdapter } from "./types";
import { DemoMbcAdapter, DemoOkiAdapter } from "./demo";
import { MbcYoutubeAdapter } from "./mbc-youtube";
import { MbcCmsAdapter } from "./mbc-cms";
import { OkinewsAdapter } from "./okinews";
import { createRssAdapter, feedUrlsFromEnv } from "./rss";

/**
 * 데모 어댑터 활성 여부.
 *
 * 데모 기사·댓글은 실수집분과 같은 media_source(mbc_cb·okinews)로 정규화되고,
 * 매칭·팟캐스트·온도 계산은 external_id 접두사나 raw._demo 를 보지 않는다.
 * 즉 둘을 동시에 켜면 창작 데모가 실제 산출물에 섞인다.
 *
 * 시연 지면을 채우려면 켜 두고, 실운영에서는 DEMO_ADAPTERS=0 으로 끈다.
 * (기본값은 켬 — 현재는 시연 준비 단계다)
 */
function demoAdaptersEnabled(rssConfigured: boolean): boolean {
  const flag = process.env.DEMO_ADAPTERS;
  if (flag === "0") return false;
  if (flag === "1") return true;
  // 미지정: 실피드(RSS)가 설정돼 있으면 데모를 내린다 — "피드 두 개만 넣으면" 합성 기사가 섞이지 않게(#184)
  return !rssConfigured;
}

/**
 * 활성 어댑터 목록 — 수집 파이프라인이 순회한다.
 *
 * 실수집 어댑터는 전제 조건이 없으면 빈 배열을 반환하므로(키 미설정·네트워크 실패),
 * 키 없는 로컬에서도 파이프라인이 깨지지 않는다.
 * external_id 접두사로 출처를 구분한다(데모 demo-* / 유튜브 yt-* / 옥천 oki-*).
 */
/**
 * 범용 RSS 어댑터 — 다른 지역판의 기본 수집 경로(#184). RSS_MACRO_FEED_URL / RSS_MICRO_FEED_URL 이 있을 때만.
 * tier 로 media_source 가 정해진다(macro → mbc_cb, micro → okinews — 표시 이름은 config/region).
 */
function rssAdapters(): MediaSourceAdapter[] {
  const out: MediaSourceAdapter[] = [];
  const macro = feedUrlsFromEnv("RSS_MACRO_FEED_URL");
  const micro = feedUrlsFromEnv("RSS_MICRO_FEED_URL");
  if (macro.length) out.push(createRssAdapter({ id: "rss_macro", tier: "macro", feedUrls: macro }));
  if (micro.length) out.push(createRssAdapter({ id: "rss_micro", tier: "micro", feedUrls: micro }));
  return out;
}

const RSS = rssAdapters();
/** RSS 피드가 설정된 계층 — 그 계층의 데모·매체 전용 어댑터는 올리지 않는다(증분 커서가 media_source 단위라 섞이면 서로 누락시킨다) */
const RSS_TIERS = new Set(RSS.map((a) => a.tier));
const demoOn = demoAdaptersEnabled(RSS.length > 0);

export const adapters: MediaSourceAdapter[] = [
  ...RSS, // 범용 RSS(피드 주소가 설정된 계층만)
  ...(demoOn && !RSS_TIERS.has("macro") ? [DemoMbcAdapter] : []), // 광역 데모 → mbc_cb
  ...(demoOn && !RSS_TIERS.has("micro") ? [DemoOkiAdapter] : []), // 기초 데모 → okinews
  ...(!RSS_TIERS.has("macro")
    ? [
        MbcYoutubeAdapter, // 광역 유튜브 실수집 → mbc_cb (키 있을 때만)
        MbcCmsAdapter, // 광역 홈페이지 뉴스 → mbc_cb (MBC_CMS_CRAWL=1)
      ]
    : []),
  ...(!RSS_TIERS.has("micro") ? [OkinewsAdapter] : []), // 기초 실수집 → okinews (sitemap)
];

/** id 로 어댑터 조회 */
export function getAdapter(id: string): MediaSourceAdapter | undefined {
  return adapters.find((a) => a.id === id);
}
