import type { MetadataRoute } from "next";
import { ICON_V } from "@/lib/icon-version";
import { region } from "@/config/region";

// PWA 매니페스트 — 홈 화면 추가 시 네이티브 앱처럼(standalone, 크림 배경).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${region.site.name} · ${region.place.name}을 잇는 두 시선`,
    short_name: region.site.name,
    description: "광역과 기초, 두 개의 시선을 잇는 지역 저널리즘 플랫폼",
    id: "/", // 설치 식별자 — 바꾸면 이미 설치된 앱과 다른 앱으로 취급된다
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f4f5f7", // 일점 지면 종이색(구 크림 #f4efe6 → 갱신)
    theme_color: "#f4f5f7",
    lang: region.site.lang,
    // ?v= 는 캐시 무효화(app/layout ICON_V 와 같은 값). 파일명·id 는 그대로라 설치된 앱은 유지된다.
    icons: [
      { src: `/icon-192.png?v=${ICON_V}`, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: `/icon-512.png?v=${ICON_V}`, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: `/icon-maskable-512.png?v=${ICON_V}`, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
