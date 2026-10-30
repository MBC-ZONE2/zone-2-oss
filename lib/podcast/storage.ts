// ============================================================================
// lib/podcast/storage — 파이프라인 8단계: 오디오 업로드 (REQ-010 · GH#16)
//
// 저장소: Supabase Storage 버킷 'podcast'(마이그레이션 0006, 비공개 — 0007). 원안(GH#6)의 R2 분기는 쓰지 않는다.
//
// 객체 경로 규칙: 버킷 'podcast' 안에서 `{YYYY}/{MM}/{episodeId}.mp3`
// ============================================================================

import { createServiceClient } from "@/lib/supabase/server";
import { mp3DurationSec } from "./audio-duration";

/** 오디오 버킷 — 마이그레이션 0006 에서 생성 */
const BUCKET = "podcast";

/** 업로드 결과 */
export interface UploadResult {
  /** 버킷 내부 객체 경로 (`{YYYY}/{MM}/{id}.mp3`) — 서명 URL 발급용 */
  objectPath: string;
  /** 전체 객체 키 (`podcast/{YYYY}/{MM}/{id}.mp3`) — R2 키 규칙과 동일 */
  key: string;
  /**
   * 재생 URL. 버킷이 비공개(마이그레이션 0007)라 스토리지 공개 URL 이 아니라
   * 발행 상태를 검사하는 앱 라우트를 가리킨다.
   */
  url: string;
  /** 바이트 크기 */
  bytes: number;
}

/** 업로드 실패 — 호출부가 에피소드를 failed 로 표시할 수 있게 구분한다 */
export class AudioUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AudioUploadError";
  }
}

/** 버킷 내부 경로 — `{YYYY}/{MM}/{episodeId}.mp3` */
function objectPath(episodeId: string, date: string): string {
  const [year, month] = date.split("-");
  return `${year ?? "0000"}/${month ?? "00"}/${episodeId}.mp3`;
}

/**
 * 오디오 바이너리를 저장소에 업로드한다.
 *
 * @param audio TTS 로 생성된 오디오 바이너리
 * @param episodeId 에피소드 id (키 구성용)
 * @param date 대상 날짜("YYYY-MM-DD") — 키 경로 구성용
 * @throws {AudioUploadError} 업로드 실패 시
 */
export async function uploadAudio(
  audio: ArrayBuffer,
  episodeId: string,
  date: string,
): Promise<UploadResult> {
  const path = objectPath(episodeId, date);
  const key = `${BUCKET}/${path}`;

  const supabase = createServiceClient();
  const { error } = await supabase.storage.from(BUCKET).upload(path, audio, {
    contentType: "audio/mpeg",
    // 재생성(재시도) 시 같은 에피소드 id 로 덮어쓴다 — 멱등.
    upsert: true,
  });

  if (error) {
    throw new AudioUploadError(`오디오 업로드 실패(${key}): ${error.message}`);
  }

  return {
    objectPath: path,
    key,
    // 검수 대기 음원이 공개되지 않도록 앱 라우트를 거친다(0007).
    url: `/api/podcast/${episodeId}/audio`,
    bytes: audio.byteLength,
  };
}

/**
 * 오디오 길이(초)를 산출한다.
 *
 * MP3 인코딩 메타에서 실제 길이를 읽고, 유효한 MP3 가 아니면
 * 스크립트 글자수 기반 추정으로 폴백한다.
 *
 * ⚠️ podcast_episodes.duration_sec 은 integer 컬럼이다 — 파싱값은 소수를
 *    포함하므로 반드시 정수로 반올림해서 돌려준다(insert 실패 방지).
 */
export function resolveDurationSec(audio: ArrayBuffer, script: string): number {
  const parsed = mp3DurationSec(audio);
  if (parsed === null) return estimateDurationSec(script);
  return Math.max(1, Math.round(parsed));
}

/**
 * 오디오 길이(초) 추정 — 폴백 경로.
 * 가정: 한국어 TTS 약 분당 1,500자 → 초당 25자.
 */
export function estimateDurationSec(script: string): number {
  const charsPerSec = 25;
  return Math.max(1, Math.round(script.length / charsPerSec));
}
