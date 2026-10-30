// ============================================================================
// components/site-footer — 사이트 푸터 (대표 지시 2026-10-21). 한 부품, 세 자리:
//   ① 홈 아닌 화면 — ReelsShell 의 .reels-page 본문 뒤(종이)
//   ② 홈 모바일 — 끝 슬라이드 맨 아래(검은 세계 → tone="dark": 종이색 띠)
//   ③ 홈 데스크탑 — 보드 끝(종이)
// 줄 1 로고(ZONE-2 · MBC충북 × 옥천신문 — 각 사 홈 링크) / 줄 1′ 재단 문장("본 서비스는 [CI]의 지원을 받아 개발되었습니다.") / 줄 2 링크(소개 /about · 개인정보 안내 /privacy · 문의 · 홈 화면에 추가) / 줄 2′ 오늘·누적 방문(components/visit-counter) / 줄 3 저작권.
// 소개·개인정보는 앱 안의 지면(app/(public)/about, privacy) — docs 사이트(docs.mbcok.com)는 내부 문서라 링크하지 않는다.
// 문의 이메일은 FOOTER_CONTACT 에 넣는다 — 비어 있으면 그 링크는 그리지 않는다(2026-10-21 대표: "이메일은 나중에").
// 관리자·위젯 임베드 링크는 일반 독자용이 아니라 두지 않는다. 「일점 지면」: 1px 괘선 + 13px 보조색 활자, 상자 없음.
// 서버 컴포넌트. 스타일 app/globals.css(.sf-*).
// ============================================================================

import Link from "next/link";
import { InstallLink } from "@/components/pwa/install-link";
import { VisitCounter } from "@/components/visit-counter";
import { region } from "@/config/region";

/** 문의 이메일 — 확정되면 여기 한 곳만 채운다 */
export const FOOTER_CONTACT = "";

/** 양사 홈 — 푸터 매체명이 링크(2026-10-21 대표 지시) */
const OUTLETS = [
  { label: region.outlets.macro.name, href: region.outlets.macro.url },
  { label: region.outlets.micro.name, href: region.outlets.micro.url },
] as const;

export function SiteFooter({ tone = "paper", className = "" }: { tone?: "paper" | "dark"; className?: string }) {
  const year = new Date().getFullYear();
  return (
    <footer className={`sf sf--${tone} ${className}`.trim()} aria-label="사이트 정보">
      <div className="sf-in">
        <p className="sf-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logos/zone2-black.png" alt={region.site.name} width={600} height={119} className="sf-logo" />
          <span className="sf-consortium">
            {OUTLETS.map((o, i) => (
              <span key={o.href}>
                {i > 0 ? <span aria-hidden> × </span> : null}
                <a href={o.href} target="_blank" rel="noopener noreferrer">{o.label}</a>
              </span>
            ))}
          </span>
        </p>
        {/* 재단 표기 — 문구 확정(2026-10-21): "본 서비스는 [CI]의 지원을 받아 개발되었습니다." 투명 배경 CI */}
        <p className="sf-funder">
          <span>{region.funder.sentence[0]}</span>
          <span className="sf-funder-ci">
            {region.funder.ci ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={region.funder.ci} alt={region.funder.name} width={757} height={214} className="sf-kpf" />
            ) : (
              <strong>{region.funder.name}</strong>
            )}
            <span>{region.funder.sentence[1]}</span>
          </span>
          <span>{region.funder.sentence[2]}</span>
        </p>
        <p className="sf-links">
          <Link href="/about">소개</Link>
          <Link href="/privacy">개인정보 안내</Link>
          {FOOTER_CONTACT ? <a href={`mailto:${FOOTER_CONTACT}`}>문의</a> : null}
          {/* 폰에서만, 홈 화면 앱이 아닐 때만 그려진다(components/pwa/install-link) */}
          <InstallLink />
        </p>
        {/* 오늘·누적 방문(2026-10-26 대표 지시, 자리 = 저작권 줄 위). 누적은 일별 순방문자 합(0029) */}
        <VisitCounter />
        <p className="sf-legal">
          기사 원문과 사진은 각 매체의 저작물입니다. © {year} {region.consortium.copyright}
        </p>
      </div>
    </footer>
  );
}
