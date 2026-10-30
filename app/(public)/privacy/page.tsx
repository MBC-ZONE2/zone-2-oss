// ============================================================================
// /privacy — 개인정보 안내 (푸터 '개인정보 안내', 2026-10-21). 실제 저장하는 것만 적는다(코드와 같게 유지).
//   작성자 해시: lib/forum/secret(hashIp·비밀번호 PBKDF2) · 방문 기록: lib/visits(180일) · 사진: /api/forum/image(메타데이터 제거)
// ============================================================================

import type { Metadata } from "next";
import Link from "next/link";
import { region } from "@/config/region";

export const metadata: Metadata = {
  title: "개인정보 안내",
  description: `${region.site.name}가 무엇을 저장하고 저장하지 않는지, 공론장 글·사진·방문 통계·수집한 댓글을 어떻게 처리하는지 안내합니다.`,
};

export default function PrivacyPage() {
  return (
    <main className="doc">
      <header className="doc-head">
        <p className="doc-k">개인정보 안내</p>
        <h1>무엇을 저장하고, 무엇을 저장하지 않는가</h1>
        <p className="doc-lede">{region.site.name}는 회원가입과 로그인이 없습니다. 아래는 실제로 서버에 남는 것의 전부입니다.</p>
      </header>

      <section>
        <h2>공론장에 글·댓글을 쓸 때</h2>
        <ul className="doc-list">
          <li><strong>글 내용, 이름(선택), 사진 1장(선택)</strong>이 공개됩니다. 이름을 비우면 익명 표시로 나옵니다.</li>
          <li><strong>비밀번호</strong>는 수정·삭제 확인용으로만 씁니다. 원문 대신 일방향 해시만 저장하므로 잊으면 복구할 수 없습니다.</li>
          <li><strong>IP 주소</strong>는 원문을 저장하지 않고 비밀값을 섞은 해시만 둡니다. 같은 사람의 글을 묶어 보여 주고 과다 등록(60초 1회)을 막는 데만 씁니다.</li>
          <li><strong>사진</strong>은 올릴 때 긴 변 1,600px 로 줄이고 촬영 위치 등 메타데이터를 제거합니다. 글을 지우면 사진도 지웁니다.</li>
          <li>자동등록방지의 덧셈 문제는 봇을 거르기 위한 것이며 답은 저장하지 않습니다.</li>
        </ul>
      </section>

      <section>
        <h2>방문 통계</h2>
        <p>
          브라우저 저장소에 <strong>무작위로 만든 식별 불가 값</strong> 하나를 둡니다. 이 값은 하루 한 번 서버에 보냅니다. 서버에는 이 값을
          한 번 더 변환한 해시와 방문 날짜, 그날 처음 연 화면의 구역만 하루 1건 남습니다. 구역은 홈·공론장 같은 묶음이며 개별 글은 기록하지
          않습니다. 기록은 <strong>180일이 지나면 삭제</strong>됩니다. 이름·연락처·IP·브라우저 정보·쿠키는 저장하지 않으며 외부 분석 도구를 쓰지
          않습니다. 브라우저 저장소를 지우면 새 값이 만들어집니다.
        </p>
      </section>

      <section>
        <h2>두 매체에서 수집하는 댓글·여론</h2>
        <p>
          {region.outlets.macro.name} 유튜브 댓글과 {region.outlets.micro.name} 여론광장 글은 공론 온도 계산에 쓰기 위해 수집합니다. 작성자 표시는 <strong>수집 즉시 해시</strong>로 바꾸고
          원본 이름·계정을 저장하지 않습니다. 본문 안의 전화번호·이메일 같은 개인정보는 수집 단계에서 가립니다.
        </p>
      </section>

      <section>
        <h2>처리 목적과 보존 기간</h2>
        <ul className="doc-list">
          <li><strong>목적</strong> — 공론장 운영(글·댓글 게시, 수정·삭제 확인, 과다 등록 방지), 공론 온도 계산, 서비스 이용 통계. 광고·마케팅에 쓰지 않습니다.</li>
          <li><strong>공론장 글·댓글·사진</strong> — 작성자가 지우거나 운영자가 가릴 때까지. 지운 글은 &ldquo;삭제된 글&rdquo; 표시만 남고 본문·사진은 지워집니다.</li>
          <li><strong>방문 기록</strong> — 180일.</li>
          <li><strong>{region.outlets.macro.name} 유튜브 댓글</strong> — 본문은 30일이 지나면 지우고, 감정 분류값과 작성자 해시만 집계용으로 남깁니다(YouTube API 서비스 약관 준수).</li>
          <li><strong>{region.outlets.micro.name} 여론광장 글</strong> — 글 제목과 작성자 해시만 온도 계산에 쓰며, 원 매체에서 지워진 글은 다음 수집에서 반영합니다.</li>
          <li><strong>제3자 제공·위탁</strong> — 없습니다. 서버는 컨소시엄이 직접 운영하며 외부 분석·광고 도구를 쓰지 않습니다.</li>
        </ul>
      </section>

      <section>
        <h2>내 정보에 대한 권리와 문의</h2>
        <p>
          공론장 글·댓글은 비밀번호로 직접 지울 수 있습니다. 비밀번호를 잊었거나, 수집된 댓글·여론 글에 대한 삭제·열람 요청, 그 밖의 개인정보 문의는
          컨소시엄 운영팀({region.consortium.label})에 알려 주시면 확인 후 처리합니다. 문의 창구는{" "}
          <a href={region.outlets.micro.url} target="_blank" rel="noopener noreferrer">{region.outlets.micro.name}</a>과{" "}
          <a href={region.outlets.macro.url} target="_blank" rel="noopener noreferrer">{region.outlets.macro.name}</a> 공식 사이트의 연락처이며,
          전용 이메일은 확정되는 대로 이 페이지와 화면 아래 푸터에 게시합니다.
        </p>
      </section>

      <section>
        <h2>검수와 삭제</h2>
        <p>
          금칙어·욕설·개인정보가 의심되는 글은 자동으로 가려지고 양사 담당자가 확인합니다. 본인 글은 비밀번호로 언제든 지울 수 있고, 지운 글에는
          &ldquo;삭제된 글&rdquo;이라는 표시만 남습니다. 다른 사람의 글에 문제가 있으면 글 아래 <strong>신고</strong>로 알려 주세요.
        </p>
      </section>

      <p className="doc-foot">
        <Link href="/about">서비스 소개 →</Link>
      </p>
    </main>
  );
}
