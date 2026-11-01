// ============================================================================
// lib/ai/tts — 음성 합성 (1순위 Gemini TTS 아나운서 톤 → OpenAI gpt-4o-mini-tts → 로컬 say)
//
// 시그니처 출처: docs/06-API명세.md §7
// 모든 호출은 Cloudflare AI Gateway 경유 (타임아웃·재시도·캐싱 적용 예정).
// 개발 모드(AI_MOCK=1 또는 OPENAI_API_KEY 없음)에서는 더미 무음 버퍼를 낸다.
// ============================================================================

import { experimental_generateSpeech as generateSpeech } from "ai";
import { getOpenAI, OPENAI_TTS_MODEL } from "./gateway";
import { isMockMode } from "./mock";
import { synthesizeLocalSpeech } from "./local-tts";
import { synthesizeGeminiSpeech } from "./gemini-tts";

/** TTS 보이스. OpenAI 보이스 ID (안정적인 기본값). */
const TTS_VOICE = "alloy";

// ---------------------------------------------------------------------------
// [MOCK] 무음 MP3 생성
//
// 이전 구현은 0으로 채운 버퍼였는데, 유효한 MP3 가 아니라 브라우저에서 재생이
// 아예 안 됐다(플레이어·길이 산출 검증 불가). 키 없이도 배선을 끝까지 확인할 수
// 있도록 "무음이지만 유효한" MP3 를 만든다.
//
// 프레임 규격: MPEG1 Layer III · 128kbps · 44.1kHz · stereo · CRC 없음
//   헤더 FF FB 90 00, 프레임 크기 floor(144 × 128000 / 44100) = 417 bytes,
//   프레임당 1152 샘플 → 1152/44100 ≈ 0.026초.
// ---------------------------------------------------------------------------

const MOCK_FRAME_HEADER = [0xff, 0xfb, 0x90, 0x00];
const MOCK_FRAME_BYTES = 417;
const MOCK_FRAME_SEC = 1152 / 44100;

/** 스크립트 길이에 대응하는 무음 MP3 길이(초) — 추정치와 어긋나지 않게 맞춘다 */
function mockDurationSec(script: string): number {
  const charsPerSec = 25; // storage.estimateDurationSec 과 동일 가정
  return Math.min(600, Math.max(1, Math.round(script.length / charsPerSec)));
}

/**
 * Uint8Array → ArrayBuffer. 뷰가 더 큰 버퍼를 공유할 수 있으므로
 * byteOffset/byteLength 구간만 잘라 정확히 해당 바이트만 담는다.
 */
function toArrayBuffer(view: Uint8Array): ArrayBuffer {
  return view.buffer.slice(
    view.byteOffset,
    view.byteOffset + view.byteLength,
  ) as ArrayBuffer;
}

/**
 * [MOCK] 무음이지만 재생 가능한 MP3 를 만든다.
 * 헤더가 유효한 Layer III 프레임을 반복하고 데이터부는 0(무음)으로 둔다.
 */
function mockAudio(script: string): ArrayBuffer {
  const frameCount = Math.ceil(mockDurationSec(script) / MOCK_FRAME_SEC);
  const bytes = new Uint8Array(frameCount * MOCK_FRAME_BYTES);

  for (let frame = 0; frame < frameCount; frame += 1) {
    bytes.set(MOCK_FRAME_HEADER, frame * MOCK_FRAME_BYTES);
    // 나머지 413 바이트는 0 — 디코더가 무음으로 재생한다.
  }

  return bytes.buffer;
}

/**
 * 음성 합성 — Gemini TTS(기본) → OpenAI gpt-4o-mini-tts → macOS say → 무음 MP3 순 폴백.
 * AI_MOCK=1 이면 외부 호출·로컬 합성 없이 바로 무음 MP3(길이만 대본 기준).
 * @returns 오디오 바이너리 (Storage 업로드용)
 */
export async function synthesizeSpeech(script: string): Promise<ArrayBuffer> {
  if (process.env.AI_MOCK === "1") return mockAudio(script);
  // 1순위: Gemini TTS(아나운서 톤, 2026-09-08 사용자 지시). TTS_PROVIDER=openai 로 끌 수 있다.
  if ((process.env.TTS_PROVIDER ?? "gemini") === "gemini") {
    const gemini = await synthesizeGeminiSpeech(script);
    if (gemini) return gemini;
    console.warn("[tts] Gemini 합성 실패 — OpenAI/로컬 폴백");
  }
  // 키 없는 로컬/셀프호스트: 먼저 실제 음성(macOS say)을 시도하고,
  // 환경 미지원 시에만 무음 MP3 로 폴백한다(배선은 유지).
  if (isMockMode("openai")) {
    const local = await synthesizeLocalSpeech(script);
    return local ?? mockAudio(script);
  }

  // 실제 호출: OpenAI gpt-4o-mini-tts via AI Gateway → 오디오 바이너리.
  const openai = getOpenAI();
  const { audio } = await generateSpeech({
    model: openai.speech(OPENAI_TTS_MODEL),
    text: script,
    voice: TTS_VOICE,
  });
  return toArrayBuffer(audio.uint8Array);
}
