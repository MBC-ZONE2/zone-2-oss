// ============================================================================
// /about — 서비스 소개 (푸터 '소개', 2026-10-21). 「일점 지면」 읽기 지면(app/globals.css .doc)
// ============================================================================

import type { Metadata } from "next";
import Link from "next/link";
import { region } from "@/config/region";

export const metadata: Metadata = {
  title: "소개",
  description: `${region.site.name}는 ${region.outlets.macro.name}과 ${region.outlets.micro.name}이 같은 사안을 어떻게 다르게 보도하는지 나란히 보여 주고 주민 여론을 공론장에 모으는 지역 뉴스 서비스입니다.`,
};

export default function AboutPage() {
  return (
    <main className="doc">
      <header className="doc-head">
        <p className="doc-k">소개</p>
        <h1>광역과 기초, 두 시선을 한 지면에</h1>
        <p className="doc-lede">
          {region.site.name}는 <strong>{region.outlets.macro.name}</strong>(광역 지상파)과 <strong>{region.outlets.micro.name}</strong>(기초 주간지)의 보도를 나란히 놓아 같은 사안을 어떻게
          다르게 다루는지 보여 줍니다. 그 아래 달린 주민 여론은 공론장에 모읍니다. {region.funder.program}으로
          만들어졌습니다.
        </p>
      </header>

      <section>
        <h2>무엇을 볼 수 있나</h2>
        <dl className="doc-dl">
          <dt><Link href="/crossview">크로스뷰</Link></dt>
          <dd>두 매체가 같은 사안을 다룬 기사를 짝지어 &ldquo;광역은 ○○ / 기초는 ○○&rdquo; 두 줄로 요약합니다. 양사 담당자가 확인한 것만 공개됩니다.</dd>
          <dt><Link href="/temperature">공론 온도계</Link></dt>
          <dd>기사 댓글과 공론장 글을 사안별로 모아 15분마다 온도(언급 빈도·감정 분산·주제 집중)를 계산합니다. 사안을 누르면 관련 기사 원문이 열립니다.</dd>
          <dt><Link href="/podcast">{region.podcast.seriesName}</Link></dt>
          <dd>매일 아침 두 매체 기사로 대본을 쓴 뒤 음성으로 합성해 몇 분짜리 브리핑으로 전합니다. {region.place.name} 소식 코너가 늘 들어갑니다.</dd>
          <dt><Link href="/forum">공론장</Link></dt>
          <dd>로그인 없이 글과 댓글, 사진 한 장을 남길 수 있습니다. 수정·삭제는 글을 쓸 때 정한 비밀번호로 합니다.</dd>
          <dt><Link href="/notices">공고</Link></dt>
          <dd>{region.government.name} 공지·고시·입법예고·채용공고를 마감일 순으로 모읍니다.</dd>
        </dl>
      </section>

      <section>
        <h2>누가 만드나</h2>
        <p>
          <a href={region.outlets.macro.url} target="_blank" rel="noopener noreferrer">{region.outlets.macro.name}</a>과{" "}
          <a href={region.outlets.micro.url} target="_blank" rel="noopener noreferrer">{region.outlets.micro.name}</a>의 컨소시엄이 운영합니다. 기사 원문과 사진은 각
          매체의 저작물이며 이 화면의 요약과 비교는 {region.site.name}가 두 보도를 읽고 정리한 것입니다. AI가 만든 요약·대본·헤드라인은 양사 담당자의
          검수를 거쳐 공개됩니다.
        </p>
        <p>
          이 소프트웨어는 다른 지역의 방송사·신문사도 쓸 수 있도록 오픈소스(Apache License 2.0)로 공개할 예정입니다.
        </p>
      </section>

      <p className="doc-foot">
        <Link href="/privacy">개인정보 안내 →</Link>
      </p>
    </main>
  );
}
