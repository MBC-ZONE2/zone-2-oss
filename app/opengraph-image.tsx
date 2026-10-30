// ============================================================================
// app/opengraph-image — 사이트 기본 OG 이미지(1200×630), 일점 지면 문법
//
// 종이 #f4f5f7 위 제호 "새로운 공론장이 펼쳐지도록" + ⋯/▬ 마커 한 줄 + 우하단 백색원(검은 바탕).
// 한글 폰트는 lib/og/fonts(Google Fonts text= 서브셋, 산세리프 Noto Sans KR) — 실패하면 폰트 없이 렌더.
// ============================================================================

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { loadKoreanFont } from "@/lib/og/fonts";
import { region } from "@/config/region";

/** 공식 로고(2026-10-21) — public/ 경로("/logos/x.png")를 읽어 data URI 로(OG 렌더러는 외부 URL 을 못 믿는다). 실패하면 활자 제호 */
async function logoDataUri(publicPath: string | null): Promise<string | null> {
  if (!publicPath) return null; // 재단 CI 가 없는 배포(공개 리포)는 이름 글자만
  try {
    const buf = await readFile(join(process.cwd(), "public", ...publicPath.split("/").filter(Boolean)));
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

export const runtime = "nodejs";
export const alt = `${region.site.name} — 새로운 공론장이 펼쳐지도록`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const HEAD = "새로운 공론장이 펼쳐지도록";
const SUB = `${region.consortium.label} — 같은 사안, 두 시선`;
/** 재단 CI 옆 한 줄 — 사업명에서 재단 이름을 뺀 나머지("2026년 디지털 미디어 개발 지원사업") */
const PROGRAM = region.funder.program.replace(region.funder.name, "").trim();

export default async function OgImage() {
  const [font, logo, kpf] = await Promise.all([
    loadKoreanFont(`${HEAD}${SUB}${PROGRAM}${region.site.name}${region.funder.name}`, 700, "Noto Sans KR").catch(() => null),
    logoDataUri("/logos/zone2-black.png"),
    logoDataUri(region.funder.ci),
  ]);
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", flexDirection: "column",
          background: "#f4f5f7", color: "#111111", padding: "72px 80px",
          fontFamily: font ? "Noto Sans KR" : "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 28, letterSpacing: 4, color: "#5b6170" }}>
          {logo ? <img src={logo} alt="" width={242} height={48} /> : region.site.name}
        </div>
        <div style={{ display: "flex", flex: 1, alignItems: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
            <div style={{ fontSize: 84, fontWeight: 700, lineHeight: 1.2, letterSpacing: -2 }}>{HEAD}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 32, color: "#5b6170" }}>
              <div style={{ display: "flex", gap: 6 }}>
                <div style={{ width: 12, height: 12, borderRadius: 12, background: "#6706d3" }} />
                <div style={{ width: 12, height: 12, borderRadius: 12, background: "#6706d3" }} />
                <div style={{ width: 12, height: 12, borderRadius: 12, background: "#6706d3" }} />
              </div>
              <div style={{ width: 36, height: 6, background: "#e66bd2" }} />
              <div>{SUB}</div>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 32, fontSize: 20, color: "#5b6170" }}>
            {kpf ? <img src={kpf} alt="" width={141} height={40} /> : <div style={{ fontWeight: 700, color: "#111111" }}>{region.funder.name}</div>}
            <div>{PROGRAM}</div>
          </div>
          <div style={{ flex: 1, height: 2, background: "#1c2130", margin: "0 40px 46px" }} />
          <div style={{ width: 96, height: 96, borderRadius: 96, background: "#0b0d12", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: 40, height: 40, borderRadius: 40, background: "#f4f5f7" }} />
          </div>
        </div>
      </div>
    ),
    { ...size, fonts: font ? [{ name: "Noto Sans KR", data: font, weight: 700, style: "normal" }] : undefined },
  );
}
