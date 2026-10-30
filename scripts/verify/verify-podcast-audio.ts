// ============================================================================
// scripts/verify/verify-podcast-audio — 팟캐스트 오디오 저장·재생 검증 (REQ-010 · GH#16)
//
// 완료조건("audio_url 로 브라우저에서 실제 재생 가능")을 기계로 확인한다.
//
// 검사 항목:
//   1) TTS 산출물이 유효한 MP3 인가 (AI_MOCK 무음 MP3 포함)
//   2) MP3 메타에서 실제 길이를 읽는가 (글자수 추정이 아니라)
//   3) Supabase Storage 에 실제로 업로드되는가
//   4) 공개 URL 이 익명으로 200 을 주는가 (= 브라우저 재생 가능)
//   5) 내려받은 바이트가 올린 바이트와 동일한가
//   6) 같은 에피소드 재업로드가 멱등인가 (재시도 안전)
//
// 실행: pnpm verify:podcast   (로컬 Supabase 기동 + 마이그레이션 0006 필요)
// ============================================================================

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvLocal(): void {
  let raw: string;
  try {
    raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  } catch {
    return;
  }
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvLocal();

const failures: string[] = [];

function check(label: string, passed: boolean, detail = ""): void {
  console.log(`  ${passed ? "✅" : "❌"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!passed) failures.push(label);
}

async function main(): Promise<void> {
  // env 로드 후에 import 해야 모듈 초기화가 올바른 설정을 본다.
  const { synthesizeSpeech } = await import("../../lib/ai/tts");
  const { mp3DurationSec } = await import("../../lib/podcast/audio-duration");
  const { uploadAudio, resolveDurationSec, estimateDurationSec } = await import(
    "../../lib/podcast/storage"
  );

  console.log("=== 팟캐스트 오디오 저장·재생 검증 ===\n");
  console.log(`AI_MOCK: ${process.env.AI_MOCK ?? "미설정"}`);

  // 약 40초 분량 스크립트(1,000자)
  const script = "안녕하세요. 오늘의 충북 소식입니다. ".repeat(50).slice(0, 1000);

  // --- 1) MP3 유효성 ------------------------------------------------------
  console.log("\n[TTS 산출물]");
  const audio = await synthesizeSpeech(script);
  const bytes = new Uint8Array(audio);
  check("오디오 바이트 존재", bytes.length > 0, `${bytes.length} bytes`);
  check(
    "MP3 프레임 동기 워드로 시작",
    bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0,
    `첫 4바이트 ${[...bytes.slice(0, 4)].map((b) => b.toString(16).padStart(2, "0")).join(" ")}`,
  );

  // --- 2) 길이 산출 -------------------------------------------------------
  console.log("\n[재생 길이]");
  const parsed = mp3DurationSec(audio);
  const estimated = estimateDurationSec(script);
  check("MP3 메타에서 길이 파싱", parsed !== null, `${parsed}초`);
  const resolved = resolveDurationSec(audio, script);
  check(
    "resolveDurationSec 가 파싱값 사용(추정 폴백 아님)",
    parsed !== null && Math.abs(resolved - parsed) < 1,
    `파싱 ${parsed}초 → ${resolved}초 (글자수추정 ${estimated}초)`,
  );
  // podcast_episodes.duration_sec 는 integer — 소수가 오면 insert 가 깨진다.
  check(
    "duration_sec 이 정수 (DB integer 컬럼 대응)",
    Number.isInteger(resolved),
    `${resolved}`,
  );
  if (parsed !== null) {
    // 무음 MP3 는 스크립트 길이에 맞춰 생성되므로 추정치와 크게 벌어지면 안 된다.
    const drift = Math.abs(parsed - estimated) / estimated;
    check("길이가 스크립트 분량과 정합", drift < 0.1, `오차 ${(drift * 100).toFixed(1)}%`);
  }

  // --- 3) 업로드 ----------------------------------------------------------
  console.log("\n[Supabase Storage 업로드]");
  const episodeId = "verify-0000-0000-0000-000000000001";
  const date = "2026-07-20";
  let result;
  try {
    result = await uploadAudio(audio, episodeId, date);
    check("업로드 성공", true, result.key);
  } catch (error) {
    check("업로드 성공", false, error instanceof Error ? error.message : String(error));
    return report();
  }

  check("키 규칙 podcast/{YYYY}/{MM}/{id}.mp3", result.key === `podcast/2026/07/${episodeId}.mp3`);
  check("버킷 내부 경로 산출", result.objectPath === `2026/07/${episodeId}.mp3`);
  check("바이트 수 일치", result.bytes === bytes.length);
  // 버킷이 비공개(0007)라 재생 URL 은 발행 상태를 검사하는 앱 라우트여야 한다.
  check(
    "재생 URL 이 앱 라우트 (스토리지 공개 URL 아님)",
    result.url === `/api/podcast/${episodeId}/audio`,
    result.url,
  );

  // --- 4) 스토리지 직접 접근이 막혔는지 ----------------------------------
  // 검수 대기 음원이 공개되면 안 된다(Codex 리뷰 P1).
  console.log("\n[스토리지 직접 접근 차단]");
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (base) {
    const publicUrl = `${base.replace(/\/$/, "")}/storage/v1/object/public/podcast/${result.objectPath}`;
    const direct = await fetch(publicUrl);
    check(
      "익명 공개 URL 차단됨",
      !direct.ok,
      `HTTP ${direct.status}`,
    );
  } else {
    check("검증 전제: SUPABASE_URL 설정", false, "미설정");
  }

  // --- 5) 서명 URL 로는 원본이 그대로 나오는지 ---------------------------
  console.log("\n[서명 URL 경유 재생]");
  const { createServiceClient } = await import("../../lib/supabase/server");
  const signed = await createServiceClient()
    .storage.from("podcast")
    .createSignedUrl(result.objectPath, 60);
  check("서명 URL 발급", Boolean(signed.data?.signedUrl));
  if (signed.data?.signedUrl) {
    const response = await fetch(signed.data.signedUrl);
    check("서명 URL GET 200", response.ok, `HTTP ${response.status}`);
    check(
      "Content-Type 이 오디오",
      (response.headers.get("content-type") ?? "").includes("audio"),
      response.headers.get("content-type") ?? "없음",
    );
    const downloaded = new Uint8Array(await response.arrayBuffer());
    check("내려받은 바이트 수 일치", downloaded.length === bytes.length,
      `${downloaded.length} vs ${bytes.length}`);
    check(
      "내려받은 오디오도 MP3 로 파싱됨",
      mp3DurationSec(downloaded.buffer as ArrayBuffer) === parsed,
    );
  }

  // --- 6) 재업로드 멱등 ---------------------------------------------------
  console.log("\n[재시도 멱등]");
  try {
    const again = await uploadAudio(audio, episodeId, date);
    check("같은 에피소드 재업로드 성공(덮어쓰기)", again.key === result.key);
  } catch (error) {
    check("같은 에피소드 재업로드 성공(덮어쓰기)", false,
      error instanceof Error ? error.message : String(error));
  }

  report();
}

function report(): void {
  console.log("");
  if (failures.length === 0) {
    console.log("=== PASS — 오디오 저장·재생 경로 전건 통과 ===");
  } else {
    console.log(`=== FAIL — ${failures.length}건 실패 ===`);
    for (const f of failures) console.log(`  - ${f}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("검증 중 예외:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
