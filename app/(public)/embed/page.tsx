"use client";

// ============================================================================
// app/(public)/embed — 임베드 위젯 가이드 (F8 · REQ-015)
//
// 양사 홈페이지 담당자용 문서 페이지. 두 위젯의 삽입 스니펫(복사 버튼) +
// 실제 위젯을 로드하는 라이브 미리보기 + 권장 크기·CORS 안내를 제공한다.
// 셸 네비에는 노출하지 않는다(푸터 링크로만 진입).
// 「일점 지면」: 카드·라운드·그림자·면 없음 — 괘선 블록과 활자만. 좌측 기준선
// 20px(<640)/76px(≥640). 로직(위젯 로드·복사·스니펫)은 무변경.
// ============================================================================

import Script from "next/script";
import { useEffect, useState } from "react";
import { region } from "@/config/region";

// 커스텀 엘리먼트를 JSX 로 안전하게 렌더하기 위한 래퍼(런타임 값은 태그 문자열).
// Web Component 라 React 는 알려진 props 를 그대로 DOM 속성으로 전달한다.
type WidgetProps = React.HTMLAttributes<HTMLElement> & {
  "data-count"?: string;
  "data-base"?: string;
};
const CrossviewWidget = "zone2-crossview-widget" as unknown as React.FC<WidgetProps>;
const ThermometerWidget =
  "zone2-thermometer-widget" as unknown as React.FC<WidgetProps>;

/** 위젯 번들 경로(현재 배포 origin 기준). */
const WIDGET_SRC = "/widgets/zone2-widgets.js";

export default function EmbedGuidePage() {
  // 스니펫에 실제 배포 도메인을 넣기 위해 마운트 후 origin 을 채운다(SSR 안전 폴백).
  const [origin, setOrigin] = useState("https://zone2.example.com");
  useEffect(() => {
    if (typeof window !== "undefined") setOrigin(window.location.origin);
  }, []);

  const crossviewSnippet = buildSnippet(origin, "zone2-crossview-widget", 3);
  const thermometerSnippet = buildSnippet(origin, "zone2-thermometer-widget", 3);

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-12 sm:px-[76px] sm:py-16">
      {/* 위젯 번들 1회 로드 — 아래 라이브 미리보기가 이 스크립트로 동작한다. */}
      <Script src={WIDGET_SRC} strategy="afterInteractive" />

      <header className="flex flex-col gap-3">
        <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-muted-foreground">임베드 가이드</p>
        <h1 className="text-[25px] font-bold leading-tight tracking-[-0.02em] text-foreground sm:text-[40px]">
          홈페이지 임베드 위젯
        </h1>
        <p className="text-[17px] leading-[1.65] text-foreground">
          {region.site.name} 의 크로스뷰·공론 온도계를 양사 홈페이지에 삽입하는 방법입니다.{" "}
          <strong className="font-bold text-foreground">
            iframe 이 아닌 Web Component(Shadow DOM)
          </strong>{" "}
          방식이라 외부 CSS 와 충돌하지 않고, 별도 빌드나 의존성 없이 스크립트 한
          줄로 동작합니다.
        </p>
      </header>

      <div className="mt-12 flex flex-col gap-12">
        <WidgetSection
          title="크로스뷰 위젯"
          description="최신 크로스뷰 비교 카드를 노출합니다. data-count 로 1~5개까지 조절할 수 있고, 30분마다 자동 갱신됩니다."
          snippet={crossviewSnippet}
          recommend="권장 너비 280–600px"
          preview={
            <div className="w-full max-w-[600px]">
              <CrossviewWidget data-count="3" />
            </div>
          }
        />

        <WidgetSection
          title="공론 온도계 위젯"
          description="공론 온도 상위 이슈를 수평 게이지로 노출합니다. 색만이 아니라 구간 라벨·패턴을 함께 표기하며, 15분마다 자동 갱신됩니다."
          snippet={thermometerSnippet}
          recommend="권장 너비 160–320px"
          preview={
            <div className="w-full max-w-[320px]">
              <ThermometerWidget data-count="3" />
            </div>
          }
        />

        <CorsNotice origin={origin} />
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// 위젯 섹션 (스니펫 + 미리보기 + 권장 크기)
// ---------------------------------------------------------------------------
function WidgetSection({
  title,
  description,
  snippet,
  recommend,
  preview,
}: {
  title: string;
  description: string;
  snippet: string;
  recommend: string;
  preview: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-5 border-t border-line pt-5">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[20px] font-bold leading-tight tracking-[-0.01em] text-foreground sm:text-[22px]">{title}</h2>
          <span className="shrink-0 text-[15px] font-medium text-muted-foreground">
            {recommend}
          </span>
        </div>
        <p className="text-[17px] leading-[1.65] text-foreground">
          {description}
        </p>
      </div>

      <CodeBlock code={snippet} />

      <div className="flex flex-col gap-2">
        <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          라이브 미리보기
        </p>
        <div className="border-y border-line py-5">
          {preview}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 코드 블록 + 복사 버튼
// ---------------------------------------------------------------------------
function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 클립보드 접근이 거부되어도 페이지 동작에는 영향을 주지 않는다.
      setCopied(false);
    }
  }

  return (
    <div className="relative overflow-hidden border-y border-line">
      <button
        type="button"
        onClick={copy}
        aria-label="삽입 코드 복사"
        className="absolute right-0 top-2 inline-flex min-h-11 items-center border border-foreground bg-background px-4 text-[15px] font-bold text-foreground hover:underline hover:underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
      >
        {copied ? "복사됨" : "복사"}
      </button>
      <pre className="overflow-x-auto py-4 pr-24 text-[15px] leading-[1.65] text-foreground">
        <code className="font-mono">{code}</code>
      </pre>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CORS 안내
// ---------------------------------------------------------------------------
function CorsNotice({ origin }: { origin: string }) {
  return (
    <section className="flex flex-col gap-3 border-t border-line pt-5">
      <h2 className="text-[20px] font-bold leading-tight tracking-[-0.01em] text-foreground sm:text-[22px]">배포·CORS 안내</h2>
      <ul className="flex flex-col gap-2 text-[17px] leading-[1.65] text-foreground">
        <li>
          위젯은 <code className="font-mono font-bold text-foreground">{origin}</code> 의
          공개 API(크로스뷰·온도계)를 읽습니다. 스크립트를 로드한 도메인이 곧 API
          베이스가 되며, 필요 시{" "}
          <code className="font-mono font-bold text-foreground">data-base</code> 속성으로
          오버라이드할 수 있습니다.
        </li>
        <li>
          외부 도메인에서의 읽기는 서버의{" "}
          <code className="font-mono font-bold text-foreground">WIDGET_ALLOWED_ORIGIN</code>{" "}
          설정으로 허용됩니다. 미설정 시 모든 오리진(*)에 열립니다(공개 읽기 전용
          데이터).
        </li>
        <li>
          모든 상세 링크는 새 탭(<code className="font-mono font-bold text-foreground">
            rel=&quot;noopener noreferrer&quot;
          </code>
          )으로 열립니다. 네트워크 오류 시 위젯은 조용히 재시도하며 삽입 페이지를
          깨뜨리지 않습니다.
        </li>
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 삽입 스니펫 문자열 생성
// ---------------------------------------------------------------------------
function buildSnippet(origin: string, tag: string, count: number): string {
  return [
    `<script src="${origin}${WIDGET_SRC}" defer></script>`,
    `<${tag} data-count="${count}"></${tag}>`,
  ].join("\n");
}
