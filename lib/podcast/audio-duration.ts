// ============================================================================
// lib/podcast/audio-duration — MP3 실제 재생 길이 산출 (GH#16)
//
// TTS 산출물(MP3)의 길이를 인코딩 메타에서 직접 읽는다.
// 글자수 기반 추정(estimateDurationSec)은 오차가 커서 플레이어 진행바가 어긋난다.
//
// 처리 순서:
//   1) ID3v2 태그가 있으면 건너뛴다(syncsafe 크기).
//   2) 첫 프레임 헤더에서 MPEG 버전·레이어·비트레이트·샘플레이트를 읽는다.
//   3) Xing/Info(VBR) 헤더가 있으면 프레임 수로 정확히 계산한다.
//   4) 없으면 CBR 로 보고 (오디오 바이트 × 8) / 비트레이트 로 계산한다.
//
// 파싱 실패 시 null 을 반환한다 — 호출부가 추정치로 폴백한다.
// ============================================================================

/** MPEG1 Layer III 비트레이트(kbps). 인덱스 0=free, 15=bad */
const BITRATES_V1_L3 = [
  0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0,
];

/** MPEG2/2.5 Layer III 비트레이트(kbps) */
const BITRATES_V2_L3 = [
  0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0,
];

/** 샘플레이트(Hz) — MPEG 버전별 */
const SAMPLE_RATES: Record<string, number[]> = {
  mpeg1: [44100, 48000, 32000],
  mpeg2: [22050, 24000, 16000],
  mpeg25: [11025, 12000, 8000],
};

interface FrameHeader {
  version: "mpeg1" | "mpeg2" | "mpeg25";
  bitrateKbps: number;
  sampleRate: number;
  samplesPerFrame: number;
  /** 채널 모드 (Xing 헤더 위치 계산용) */
  isMono: boolean;
}

/** ID3v2 태그 길이를 반환한다(없으면 0) */
function id3v2Size(bytes: Uint8Array): number {
  const hasTag =
    bytes.length >= 10 &&
    bytes[0] === 0x49 && // 'I'
    bytes[1] === 0x44 && // 'D'
    bytes[2] === 0x33; // '3'
  if (!hasTag) return 0;

  // syncsafe integer: 각 바이트의 하위 7비트만 사용
  const size =
    ((bytes[6] & 0x7f) << 21) |
    ((bytes[7] & 0x7f) << 14) |
    ((bytes[8] & 0x7f) << 7) |
    (bytes[9] & 0x7f);
  return 10 + size;
}

/** offset 위치의 4바이트를 프레임 헤더로 해석한다 (유효하지 않으면 null) */
function parseFrameHeader(bytes: Uint8Array, offset: number): FrameHeader | null {
  if (offset + 4 > bytes.length) return null;

  // 프레임 동기: 11비트 전부 1
  if (bytes[offset] !== 0xff || (bytes[offset + 1] & 0xe0) !== 0xe0) return null;

  const versionBits = (bytes[offset + 1] >> 3) & 0x03;
  const layerBits = (bytes[offset + 1] >> 1) & 0x03;
  // Layer III 만 다룬다(TTS 산출물은 MP3). layerBits 01 = Layer III
  if (layerBits !== 0x01) return null;

  const version =
    versionBits === 0x03 ? "mpeg1" : versionBits === 0x02 ? "mpeg2" : versionBits === 0x00 ? "mpeg25" : null;
  if (!version) return null; // 0x01 = reserved

  const bitrateIndex = (bytes[offset + 2] >> 4) & 0x0f;
  const sampleRateIndex = (bytes[offset + 2] >> 2) & 0x03;
  if (bitrateIndex === 0 || bitrateIndex === 0x0f || sampleRateIndex === 0x03) {
    return null;
  }

  const table = version === "mpeg1" ? BITRATES_V1_L3 : BITRATES_V2_L3;
  const sampleRate = SAMPLE_RATES[version][sampleRateIndex];
  const channelMode = (bytes[offset + 3] >> 6) & 0x03;

  return {
    version,
    bitrateKbps: table[bitrateIndex],
    sampleRate,
    // MPEG1 Layer III = 1152 샘플, MPEG2/2.5 = 576 샘플
    samplesPerFrame: version === "mpeg1" ? 1152 : 576,
    isMono: channelMode === 0x03,
  };
}

/** 첫 유효 프레임 헤더 위치를 찾는다 (동기 워드 탐색) */
function findFirstFrame(
  bytes: Uint8Array,
  start: number,
): { offset: number; header: FrameHeader } | null {
  const limit = Math.min(bytes.length - 4, start + 64 * 1024);
  for (let offset = start; offset <= limit; offset += 1) {
    const header = parseFrameHeader(bytes, offset);
    if (header) return { offset, header };
  }
  return null;
}

/**
 * Xing/Info(VBR) 헤더의 프레임 수를 읽는다.
 * 헤더는 첫 프레임의 사이드 정보 뒤에 위치한다.
 */
function xingFrameCount(
  bytes: Uint8Array,
  frameOffset: number,
  header: FrameHeader,
): number | null {
  // 사이드 정보 크기 — MPEG 버전·채널 모드에 따라 결정
  const sideInfoSize =
    header.version === "mpeg1"
      ? header.isMono
        ? 17
        : 32
      : header.isMono
        ? 9
        : 17;

  const tagOffset = frameOffset + 4 + sideInfoSize;
  if (tagOffset + 12 > bytes.length) return null;

  const tag = String.fromCharCode(
    bytes[tagOffset],
    bytes[tagOffset + 1],
    bytes[tagOffset + 2],
    bytes[tagOffset + 3],
  );
  if (tag !== "Xing" && tag !== "Info") return null;

  // flags 하위 비트 1 = frame count 필드 존재
  const flags = readUint32(bytes, tagOffset + 4);
  if ((flags & 0x01) === 0) return null;

  return readUint32(bytes, tagOffset + 8);
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3]) >>>
    0
  );
}

/**
 * MP3 바이너리의 재생 길이(초)를 산출한다.
 * 유효한 MP3 가 아니거나 파싱에 실패하면 null.
 */
export function mp3DurationSec(audio: ArrayBuffer): number | null {
  const bytes = new Uint8Array(audio);
  if (bytes.length < 128) return null;

  const audioStart = id3v2Size(bytes);
  const first = findFirstFrame(bytes, audioStart);
  if (!first) return null;

  const { offset, header } = first;

  // VBR: 프레임 수 × 프레임당 샘플 수 ÷ 샘플레이트
  const frames = xingFrameCount(bytes, offset, header);
  if (frames && frames > 0) {
    return round1((frames * header.samplesPerFrame) / header.sampleRate);
  }

  // CBR: 오디오 바이트 × 8 ÷ 비트레이트
  const audioBytes = bytes.length - offset;
  const seconds = (audioBytes * 8) / (header.bitrateKbps * 1000);
  return seconds > 0 ? round1(seconds) : null;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
