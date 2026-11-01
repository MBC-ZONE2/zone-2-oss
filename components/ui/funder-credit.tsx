// ============================================================================
// components/ui/funder-credit — 한국언론진흥재단 지원 표기 (대표 지시 2026-10-21)
//
// 문구(대표 확정 2026-10-21): "본 서비스는 [재단 CI]의 지원을 받아 개발되었습니다." — CI 가 문장 안의 주어 자리다.
// CI 는 투명 배경 공식 PNG(public/logos/kpf.png) 하나만 쓴다. 검은 세계(끝 슬라이드)는 종이색 띠(.funder--band) 위에.
// CI 는 제3자 상표라 색을 바꾸거나 반전하지 않는다(재단 CI 규정). 조사 "의"는 CI 와 한 덩어리(.funder-ci-wrap)로 묶어
// 줄이 꺾여도 CI 와 떨어지지 않는다. 서버 컴포넌트. 스타일 app/globals.css(.funder*).
// ============================================================================

import { region } from "@/config/region";

export function FunderCredit({ tone = "paper", className = "" }: { tone?: "paper" | "dark"; className?: string }) {
  return (
    <p className={`funder ${tone === "dark" ? "funder--band" : ""} ${className}`.trim()}>
      <span className="funder-t">{region.funder.sentence[0]}</span>
      <span className="funder-ci-wrap">
        {region.funder.ci ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={region.funder.ci} alt={region.funder.name} width={757} height={214} className="funder-ci" />
        ) : (
          <strong className="funder-t">{region.funder.name}</strong>
        )}
        <span className="funder-t">{region.funder.sentence[1]}</span>
      </span>
      <span className="funder-t">{region.funder.sentence[2]}</span>
    </p>
  );
}
