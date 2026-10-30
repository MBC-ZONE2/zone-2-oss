// 공개 리포 스텁 — 광역 매체(MBC충북) 홈페이지 뉴스 수집기는 컨소시엄 운영용이라 포함하지 않는다.
// 이 저장소의 공개는 해당 매체 콘텐츠의 수집·이용 권리를 부여하지 않는다(NOTICE). 자기 매체의 허가 아래 같은 인터페이스로 구현하라.
import type { MediaSourceAdapter } from "./types";

export const MbcCmsAdapter: MediaSourceAdapter = {
  id: "mbc_cb",
  tier: "macro",
  // 광역 매체 홈페이지 수집기 스텁 — 아무것도 수집하지 않는다
  async fetchArticles() { return []; },
  async fetchComments() { return []; },
};
