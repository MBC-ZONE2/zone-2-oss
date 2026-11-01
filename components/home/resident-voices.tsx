// ============================================================================
// components/home/resident-voices — "주민의 목소리" 3단 인용 (리드 하단)
//
// 세리프 15.5px 인용 3단. 리드와는 32px 여백으로 구분(굵은 괘선 제거 — 홈의 굵은
// 괘선은 리드/스트림·대조 지면 상단 2개로 한정). 단 사이 세로 hairline만 유지한다.
// 데이터는 fetch-board 가 voices 헬퍼(공감 상위 댓글 3건)로 주입한다. 비면 섹션
// 자체를 렌더하지 않는다(홈 불파괴). 서버 컴포넌트.
// ============================================================================

import type { ResidentVoice } from "./voices";

interface ResidentVoicesProps {
  voices: ResidentVoice[];
}

/** 주민의 목소리 3단 인용 (데이터 없으면 미노출) */
export function ResidentVoices({ voices }: ResidentVoicesProps) {
  if (voices.length === 0) return null;

  return (
    <section aria-labelledby="voices-title" className="flex flex-col">
      <h2
        id="voices-title"
        className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground"
      >
        주민의 목소리
      </h2>
      <ul className="mt-3 grid gap-x-5 gap-y-4 sm:grid-cols-3">
        {voices.map((v, i) => (
          <li
            key={v.id}
            className={
              i > 0
                ? "border-t border-line pt-4 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0"
                : undefined
            }
          >
            <blockquote className="break-keep font-display text-[15.5px] leading-relaxed text-foreground">
              &ldquo;{v.body}&rdquo;
            </blockquote>
            <cite className="mt-1.5 block text-[11px] font-semibold uppercase not-italic tracking-[0.08em] text-muted-foreground">
              {v.sourceLabel}
            </cite>
          </li>
        ))}
      </ul>
    </section>
  );
}
