// ============================================================================
// lib/ai/gemini-tts — Gemini 음성 합성 (gemini-3.1-flash-tts-preview, 아나운서 톤)
//
// 사용자 지시(2026-09-08): 팟캐 음성은 Gemini TTS 로, 뉴스 아나운서처럼 읽는다.
// 9월 회차부터 적용(scripts/ops/resynth-podcast-gemini.ts 로 기존 9월 회차 재합성).
//
// 흐름: generateContent(responseModalities: AUDIO) → inlineData(PCM s16le 24kHz mono,
//       base64) → ffmpeg(libmp3lame) 로 MP3 변환 → 기존 파이프라인(길이 산출·업로드) 그대로.
// 환경: GOOGLE_GENERATIVE_AI_API_KEY(필수, 크로스뷰 이미지와 같은 키),
//       GEMINI_TTS_MODEL(기본 gemini-3.1-flash-tts-preview), GEMINI_TTS_VOICE(기본 Kore).
// 실패(키 없음·HTTP 오류·ffmpeg 없음)는 null → 호출측이 OpenAI/로컬 폴백.
// ============================================================================

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const GEMINI_TTS_MODEL = process.env.GEMINI_TTS_MODEL?.trim() || "gemini-3.1-flash-tts-preview";
/** 기본 보이스 — 차분하고 또렷한 톤. 한국어는 어느 프리빌트 보이스든 읽는다 */
export const GEMINI_TTS_VOICE = process.env.GEMINI_TTS_VOICE?.trim() || "Kore";

/** 읽기 지시 — 본문 앞에 붙는 연출 문장(Gemini TTS 는 지시문을 낭독하지 않는다) */
const STYLE_PROMPT =
  "다음 대본을 지역 방송 뉴스 아나운서처럼 읽어 주세요. 차분하고 또렷한 표준어 발음, " +
  "문장 끝을 분명히 맺고, 숫자와 고유명사는 정확하게, 과장 없이 신뢰감 있게:\n\n";

const TIMEOUT_MS = 240_000; // 청크(≈1,200자·2분 음성) 기준
const MAX_CHARS = 12_000;

interface GeminiPart {
  inlineData?: { mimeType?: string; data?: string };
  text?: string;
}

/** PCM(s16le) → MP3. 샘플레이트는 mimeType 의 rate= 값(기본 24000) */
async function pcmToMp3(pcm: Buffer, sampleRate: number): Promise<Buffer | null> {
  const { spawn } = await import(/* webpackIgnore: true */ "node:child_process");
  const dir = await mkdtemp(join(tmpdir(), "zone2-gemini-tts-"));
  try {
    const raw = join(dir, "in.pcm");
    const mp3 = join(dir, "out.mp3");
    await writeFile(raw, pcm);
    const code = await new Promise<number>((resolve) => {
      const child = spawn(
        "ffmpeg",
        ["-y", "-loglevel", "error", "-f", "s16le", "-ar", String(sampleRate), "-ac", "1", "-i", raw,
          "-codec:a", "libmp3lame", "-b:a", "96k", "-ar", "44100", mp3],
        { stdio: "ignore" },
      );
      const timer = setTimeout(() => { child.kill("SIGKILL"); resolve(-1); }, TIMEOUT_MS);
      child.on("error", () => { clearTimeout(timer); resolve(-1); });
      child.on("close", (c) => { clearTimeout(timer); resolve(c ?? -1); });
    });
    if (code !== 0) return null;
    return await readFile(mp3);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** 대본을 문단 경계에서 청크로 나눈다(한 요청 8~10분 음성은 시간 초과 — 1,200자 안팎으로) */
export function chunkScript(text: string, maxChars = 1200): string[] {
  const paras = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const out: string[] = [];
  let cur = "";
  for (const p of paras) {
    const piece = p.length > maxChars ? p.match(new RegExp(`[\\s\\S]{1,${maxChars}}(?:\\s|$)`, "g")) ?? [p] : [p];
    for (const q of piece) {
      if (cur && (cur.length + q.length + 2) > maxChars) { out.push(cur); cur = q; }
      else cur = cur ? `${cur}\n\n${q}` : q;
    }
  }
  if (cur) out.push(cur);
  return out;
}

interface PcmChunk { pcm: Buffer; rate: number }

/** 청크 하나 합성 → PCM. 실패 시 null */
async function synthesizeChunk(apiKey: string, text: string, index: number): Promise<PcmChunk | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TTS_MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ parts: [{ text: STYLE_PROMPT + text }] }],
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: GEMINI_TTS_VOICE } } },
          },
        }),
      },
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[gemini-tts] 청크 ${index} HTTP ${res.status}: ${body.slice(0, 300)}`);
      return null;
    }
    const json = (await res.json()) as { candidates?: { content?: { parts?: GeminiPart[] } }[] };
    const part = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
    if (!part?.inlineData?.data) {
      console.error(`[gemini-tts] 청크 ${index} 응답에 오디오가 없습니다`);
      return null;
    }
    const mime = part.inlineData.mimeType ?? "audio/L16;codec=pcm;rate=24000";
    if (!/pcm|L16/i.test(mime)) {
      console.error(`[gemini-tts] 청크 ${index} 예상 밖 포맷: ${mime}`);
      return null;
    }
    return { pcm: Buffer.from(part.inlineData.data, "base64"), rate: Number(/rate=(\d+)/.exec(mime)?.[1] ?? 24000) };
  } catch (error) {
    console.error(`[gemini-tts] 청크 ${index} 실패:`, error instanceof Error ? error.message : String(error));
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Gemini TTS 로 대본을 읽어 MP3 바이너리를 만든다. 문단 청크로 나눠 순서대로 합성하고
 * 청크 사이 0.4초 무음을 끼워 하나의 PCM 으로 이은 뒤 MP3 로 변환. 실패 시 null(호출측 폴백).
 */
export async function synthesizeGeminiSpeech(script: string): Promise<ArrayBuffer | null> {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
  if (!apiKey) return null;
  const text = script.trim().slice(0, MAX_CHARS);
  if (!text) return null;

  const chunks = chunkScript(text);
  const parts: PcmChunk[] = [];
  for (const [i, chunk] of chunks.entries()) {
    // 두 번까지 재시도(일시 오류·시간 초과)
    let got: PcmChunk | null = null;
    for (let attempt = 0; attempt < 2 && !got; attempt += 1) got = await synthesizeChunk(apiKey, chunk, i + 1);
    if (!got) return null;
    parts.push(got);
  }
  const rate = parts[0].rate;
  const gap = Buffer.alloc(Math.round(rate * 0.4) * 2); // 0.4초 무음(s16le mono)
  const joined = Buffer.concat(parts.flatMap((p, i) => (i === 0 ? [p.pcm] : [gap, p.pcm])));
  const mp3 = await pcmToMp3(joined, rate);
  if (!mp3) {
    console.error("[gemini-tts] ffmpeg 변환 실패");
    return null;
  }
  return mp3.buffer.slice(mp3.byteOffset, mp3.byteOffset + mp3.byteLength) as ArrayBuffer;
}
