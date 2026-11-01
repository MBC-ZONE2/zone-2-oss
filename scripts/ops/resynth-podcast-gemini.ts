// ============================================================================
// scripts/ops/resynth-podcast-gemini — 9월 회차 음성을 Gemini TTS(아나운서 톤)로 재합성
//
// 사용자 지시(2026-09-08): "9월부터 시작한 팟캐스트에만 적용". 대본(script)은 그대로 두고
// 오디오만 다시 만들어 같은 audio_key 로 덮어쓰고(uploadAudio upsert) duration_sec 을 갱신한다.
//
// 실행(기본 dry-run — 대상만 나열):  pnpm tsx scripts/ops/resynth-podcast-gemini.ts
// 실제 반영:                         pnpm tsx scripts/ops/resynth-podcast-gemini.ts --apply
// 옵션: --since=2026-09-01 (기본) · --id=<episodeId> (한 건만) · --test="문장" (합성만 해 /tmp 에 저장)
// 필요 env(.env.local): GOOGLE_GENERATIVE_AI_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// ============================================================================

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv(): void {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i === -1) continue;
      const k = t.slice(0, i).trim();
      if (process.env[k] === undefined) process.env[k] = t.slice(i + 1).trim();
    }
  } catch { /* .env.local 없으면 환경변수 그대로 */ }
}
loadEnv();

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const apply = argv.includes("--apply");
  const since = argv.find((a) => a.startsWith("--since="))?.slice(8) ?? "2026-09-01";
  const onlyId = argv.find((a) => a.startsWith("--id="))?.slice(5);
  const test = argv.find((a) => a.startsWith("--test="))?.slice(7);

  const { synthesizeGeminiSpeech, GEMINI_TTS_MODEL, GEMINI_TTS_VOICE } = await import("../../lib/ai/gemini-tts");
  console.log(`모델 ${GEMINI_TTS_MODEL} · 보이스 ${GEMINI_TTS_VOICE}`);

  if (test) {
    const t0 = Date.now();
    const audio = await synthesizeGeminiSpeech(test);
    if (!audio) throw new Error("합성 실패");
    const out = resolve("/tmp", "zone2-gemini-tts-test.mp3");
    writeFileSync(out, Buffer.from(audio));
    console.log(`OK ${audio.byteLength} bytes, ${Date.now() - t0}ms → ${out}`);
    return;
  }

  const { createServiceClient } = await import("../../lib/supabase/server");
  const { uploadAudio, resolveDurationSec } = await import("../../lib/podcast/storage");
  const sb = createServiceClient();
  let q = sb
    .from("podcast_episodes")
    .select("id, title, script, scheduled_for, published_at, status, duration_sec, audio_key")
    .gte("scheduled_for", since)
    .order("scheduled_for", { ascending: true });
  if (onlyId) q = q.eq("id", onlyId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const rows = (data ?? []).filter((r) => r.script && r.status !== "failed");
  console.log(`${apply ? "[APPLY]" : "[DRY-RUN]"} 대상 ${rows.length}건 (scheduled_for ≥ ${since})`);
  let ok = 0;
  let failed = 0;
  for (const [i, ep] of rows.entries()) {
    const tag = `[${i + 1}/${rows.length}] ${ep.title} (${ep.status}, ${ep.duration_sec}s)`;
    if (!apply) { console.log(`${tag} — 대본 ${String(ep.script).length}자`); continue; }
    const t0 = Date.now();
    const audio = await synthesizeGeminiSpeech(String(ep.script));
    if (!audio) { failed += 1; console.error(`${tag} 합성 실패`); continue; }
    const durationSec = resolveDurationSec(audio, String(ep.script));
    const date = String(ep.scheduled_for).slice(0, 10);
    try {
      const up = await uploadAudio(audio, ep.id, date);
      const { error: uErr } = await sb
        .from("podcast_episodes")
        .update({ audio_url: up.url, audio_key: up.objectPath, duration_sec: durationSec })
        .eq("id", ep.id);
      if (uErr) throw new Error(uErr.message);
      ok += 1;
      console.log(`${tag} → ${Math.round(audio.byteLength / 1024)}KB, ${durationSec}s, ${Math.round((Date.now() - t0) / 1000)}s 소요`);
    } catch (e) {
      failed += 1;
      console.error(`${tag} 업로드/갱신 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  console.log(`완료: 성공 ${ok} · 실패 ${failed}`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((e) => { console.error(e instanceof Error ? e.message : String(e)); process.exit(1); });
