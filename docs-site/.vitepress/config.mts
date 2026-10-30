import { defineConfig } from "vitepress";
import { withMermaid } from "vitepress-plugin-mermaid";

// ZONE-2 문서 사이트 (docs.mbcok.com). 정적 빌드 → 터널 서빙.
export default withMermaid(defineConfig({
  lang: "ko-KR",
  title: "ZONE-2 Docs",
  description: "광역(충북)과 기초(옥천)를 잇는 지역 공론 미디어 — 사용·운영 가이드",
  base: "/",
  // 정적 파일서버(python http.server)에서 서빙하므로 확장자 URL 사용(clean URL 리라이트 불가)
  cleanUrls: false,
  lastUpdated: true,
  head: [["meta", { name: "robots", content: "noindex" }]], // 내부 문서 — 검색 색인 제외

  // Mermaid — 브랜드(네이비/골드/잉크) 커스텀 테마. 빌드타임 번들(오프라인 안전).
  // theme:'base' + themeVariables 로 노드/엣지/서브그래프 색을 지정.
  // classDef 인라인 색(온도계 5구간 등)은 themeVariables 보다 우선하므로 그대로 유지됨.
  // 다크모드는 플러그인이 theme:'dark' 로 강제하되 themeVariables 는 병합 → custom.css 에서
  // .dark .mermaid SVG 를 보정(서브그래프 패널·엣지라벨). 노드 칩은 라이트 유지(에디토리얼).
  mermaid: {
    theme: "base",
    themeVariables: {
      fontFamily:
        'Inter, "Apple SD Gothic Neo", "Noto Sans KR", system-ui, sans-serif',
      fontSize: "14px",
      // 노드(기본)
      primaryColor: "#eaf1fb",
      primaryBorderColor: "#1e4a86",
      primaryTextColor: "#16202e",
      nodeBorder: "#1e4a86",
      // 엣지
      lineColor: "#5b7ea8",
      edgeLabelBackground: "#f7f6f1",
      // 서브그래프(cluster)
      clusterBkg: "#f4f1ea",
      clusterBorder: "#c9b98f",
      titleColor: "#173561",
      // 보조
      secondaryColor: "#f4f1ea",
      tertiaryColor: "#f7f6f1",
      mainBkg: "#eaf1fb",
    },
  },

  themeConfig: {
    nav: [
      { text: "소개", link: "/guide/intro" },
      { text: "기능", link: "/guide/features" },
      { text: "동작 원리", link: "/guide/how-it-works" },
      { text: "데이터·크롤러", link: "/guide/data" },
      { text: "운영", link: "/guide/operations" },
      { text: "mbcok.com", link: "https://mbcok.com" },
    ],
    sidebar: {
      "/guide/": [
        {
          text: "시작하기",
          items: [
            { text: "서비스 소개", link: "/guide/intro" },
            { text: "주요 기능", link: "/guide/features" },
            { text: "동작 원리(도식)", link: "/guide/how-it-works" },
          ],
        },
        {
          text: "데이터",
          items: [{ text: "데이터 소스·크롤러", link: "/guide/data" }],
        },
        {
          text: "운영",
          items: [{ text: "배포·크론·운영", link: "/guide/operations" }],
        },
      ],
    },
    outline: { label: "이 페이지", level: [2, 3] },
    docFooter: { prev: "이전", next: "다음" },
    lastUpdatedText: "마지막 수정",
    darkModeSwitchLabel: "테마",
    returnToTopLabel: "위로",
    footer: {
      message: "ZONE-2 내부 문서 — MBC충북 × 옥천신문",
      copyright: "한국언론진흥재단 2026 지원사업",
    },
  },
}));
