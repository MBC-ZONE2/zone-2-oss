// ============================================================================
// components/podcast/script — 대본 단락 분해 + 재생 시각 ↔ 단락 매핑 (순수 함수)
//
// TTS 단계에 단락 타임스탬프가 없으므로 "글자수 비례"로 시각을 나눈다(기획안 (5)).
// 단락 i 의 시작 시각 = duration × (i 앞 단락 글자수 누적 / 전체 글자수).
// ============================================================================

/** 문장 단위로 잘라 최대 maxLen 자 안팎의 덩어리로 다시 묶는다(단락 구분이 없는 대본용) */
function chunkSentences(text: string, maxLen: number): string[] {
  const sentences = text.match(/[^.!?…\n]+[.!?…]+["'”’)]*\s*|[^.!?…\n]+$/g) ?? [text];
  const out: string[] = [];
  let cur = "";
  for (const raw of sentences) {
    const s = raw.trim();
    if (!s) continue;
    if (cur && cur.length + s.length > maxLen) {
      out.push(cur);
      cur = s;
    } else {
      cur = cur ? `${cur} ${s}` : s;
    }
  }
  if (cur) out.push(cur);
  return out;
}

/**
 * 대본 → 단락 배열. 빈 줄 기준으로 나누고, 빈 줄이 없으면 줄바꿈으로,
 * 그래도 한 덩어리면 문장 단위로 100자 안팎씩 묶는다. 빈 대본은 [].
 */
export function splitScript(script: string | null | undefined): string[] {
  const text = (script ?? "").replace(/\r\n?/g, "\n").trim();
  if (!text) return [];
  let parts = text.split(/\n\s*\n+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 1) {
    parts = text.split(/\n+/).map((p) => p.trim()).filter(Boolean);
  }
  if (parts.length <= 1 && text.length > 140) {
    parts = chunkSentences(text, 100);
  }
  return parts.length > 0 ? parts : [text];
}

/** 단락별 시작 시각(초) — 글자수 비례. duration 이 0 이하면 전부 0. */
export function paragraphStarts(paragraphs: string[], duration: number): number[] {
  const total = paragraphs.reduce((n, p) => n + p.length, 0);
  if (!(duration > 0) || total === 0) return paragraphs.map(() => 0);
  let acc = 0;
  return paragraphs.map((p) => {
    const start = (acc / total) * duration;
    acc += p.length;
    return start;
  });
}

/** 현재 시각이 속한 단락 번호(0부터). 시작 시각이 t 이하인 마지막 단락. */
export function paragraphIndexAt(starts: number[], t: number): number {
  if (starts.length === 0) return -1;
  let idx = 0;
  for (let i = 0; i < starts.length; i += 1) {
    if (starts[i] <= t) idx = i;
    else break;
  }
  return idx;
}
