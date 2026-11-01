// ============================================================================
// app/admin/_components/admin-footer — 운영 데스크 푸터 (대표 지시 2026-10-26)
// 공개 화면 푸터(components/site-footer)와 같은 재단 표기 문장·투명 CI 를 쓴다. 로그인 화면에도 나온다.
// 「일점 지면」: 1px 괘선 + 13px 보조색 활자. 스타일 app/admin.css(.ad-foot), CI 는 globals.css(.sf-funder*).
// ============================================================================

import { region } from "@/config/region";

export function AdminFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="ad-foot" aria-label="운영 데스크 정보">
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
      <p className="ad-foot-legal">{region.site.name} 운영 데스크 · © {year} {region.consortium.copyright}</p>
    </footer>
  );
}
