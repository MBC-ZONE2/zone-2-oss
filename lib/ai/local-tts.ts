// ============================================================================
// lib/ai/local-tts — 로컬 한국어 음성 합성 (macOS say + ffmpeg)
//
// OpenAI TTS 키가 없을 때의 실동작 폴백이다. 이전 mock 은 "무음 MP3"라 재생은
// 되지만 소리가 없었다 — 여기서는 macOS 내장 TTS(say)로 실제 한국어 음성을
// 만들어 ffmpeg 로 MP3 로 변환한다. Mac Studio self-host 운영 방침과 맞는다.
//
// ⚠️ 환경 의존: `say`(macOS)·`ffmpeg` 가 있어야 한다. 없거나 실패하면 null 을
//    반환하고 호출부가 무음 MP3 로 폴백한다. Cloudflare 배포 경로는 이 함수를
//    쓰지 않는다(실제 OpenAI 키 필요).
// ============================================================================

// ⚠️ node 빌트인은 함수 안에서 동적 import 한다. top-level import 하면
//    Next/webpack 이 이 모듈을 거쳐 lib/ai 전체를 서버 번들에 넣으려다
//    "node:child_process is not handled" 로 라우트 빌드가 깨진다.

/**
 * 낭독 속도(wpm). 기본 `say` 속도는 빠르고 딱딱해서 살짝 늦춰 자연스럽게.
 */
const RATE_WPM = Number(process.env.LOCAL_TTS_RATE || "175");

/** 합성 상한 — 너무 긴 대본으로 프로세스가 매달리지 않게 */
const MAX_CHARS = 8000;

/** 자식 프로세스 타임아웃(ms) */
const TIMEOUT_MS = 120_000;

/** 명령 실행 후 표준출력을 문자열로 돌려준다(음성 목록 조회용). */
async function runCapture(cmd: string, args: string[]): Promise<string> {
  const { spawn } = await import(/* webpackIgnore: true */ "node:child_process");
  return new Promise((resolve) => {
    const child = spawn(cmd, args);
    let out = "";
    child.stdout?.on("data", (d) => (out += d.toString()));
    child.on("error", () => resolve(""));
    child.on("close", () => resolve(out));
  });
}

/**
 * 사용할 한국어 보이스를 고른다.
 * 우선순위: 명시 설정 > enhanced/premium(자연스러움) > 기본 compact(Yuna).
 *
 * enhanced/premium 음성은 시스템 설정 > 손쉬운 사용 > 음성 콘텐츠에서
 * 한 번 다운로드하면 자동으로 선택된다(신경망 음성이라 훨씬 자연스럽다).
 */
async function pickKoreanVoice(): Promise<string> {
  const explicit = process.env.LOCAL_TTS_VOICE?.trim();
  if (explicit) return explicit;

  const list = await runCapture("say", ["-v", "?"]);
  const koreanLines = list
    .split("\n")
    .filter((line) => /\bko_KR\b/.test(line));

  // "Yuna (Premium)" / "Yuna (Enhanced)" / "유나(향상됨)" 같은 고품질 우선
  const premium = koreanLines.find((line) =>
    /(premium|enhanced|향상|프리미엄)/i.test(line),
  );
  const pick = premium ?? koreanLines[0];
  // 보이스명은 locale(2칸 이상 공백) 앞까지. 이름에 괄호가 들어갈 수 있어
  // ("Yuna (Premium)") 괄호 전까지가 아니라 2칸 공백 전까지를 잡는다.
  const name = pick?.match(/^(.+?)\s{2,}\S+_\S+/)?.[1]?.trim();
  return name || "Yuna";
}

/** 명령을 실행하고 종료 코드를 돌려준다(입력은 인자로만 전달, 셸 미경유). */
async function run(cmd: string, args: string[]): Promise<number> {
  const { spawn } = await import(/* webpackIgnore: true */ "node:child_process");
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "ignore" });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${cmd} 타임아웃`));
    }, TIMEOUT_MS);
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve(code ?? 1);
    });
  });
}

/**
 * 대본을 실제 한국어 음성 MP3 로 합성한다.
 *
 * @returns MP3 ArrayBuffer, 또는 환경 미지원·실패 시 null
 */
export async function synthesizeLocalSpeech(
  script: string,
): Promise<ArrayBuffer | null> {
  const text = script.trim().slice(0, MAX_CHARS);
  if (!text) return null;

  const { mkdtemp, readFile, rm } = await import(/* webpackIgnore: true */ "node:fs/promises");
  const { tmpdir } = await import(/* webpackIgnore: true */ "node:os");
  const { join } = await import(/* webpackIgnore: true */ "node:path");

  let dir: string | null = null;
  try {
    dir = await mkdtemp(join(tmpdir(), "zone2-tts-"));
    const aiff = join(dir, "out.aiff");
    const mp3 = join(dir, "out.mp3");

    // say 는 텍스트를 인자로 받는다(셸 미경유라 인젝션 안전).
    // 보이스는 enhanced/premium 이 있으면 자동 선택(자연스러움), 속도는 살짝 늦춤.
    const voice = await pickKoreanVoice();
    const sayCode = await run("say", [
      "-v", voice,
      "-r", String(RATE_WPM),
      "-o", aiff,
      text,
    ]);
    if (sayCode !== 0) return null;

    const ffmpegCode = await run("ffmpeg", [
      "-y",
      "-i", aiff,
      "-codec:a", "libmp3lame",
      "-b:a", "96k",
      "-ar", "44100",
      mp3,
    ]);
    if (ffmpegCode !== 0) return null;

    const buffer = await readFile(mp3);
    return buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    ) as ArrayBuffer;
  } catch {
    // `say`/`ffmpeg` 미설치, 권한, 타임아웃 등 — 무음 폴백으로.
    return null;
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
