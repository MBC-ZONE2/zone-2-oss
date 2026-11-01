// 전체 기사 재매칭(1회) — 크론의 maxArticlesPerRun(60) 상한을 넘겨 전 기간을 처리.
// AI_MOCK 모크 재랭킹으로 후보(candidate)를 넉넉히 만든 뒤 Codex 로 정제하는 용도.
// 실행: pnpm tsx scripts/ops/rematch-all.ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv(): void {
  const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  for (const l of raw.split("\n")) {
    const t = l.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    if (process.env[t.slice(0, i)] === undefined) process.env[t.slice(0, i)] = t.slice(i + 1);
  }
}

async function main(): Promise<void> {
  loadEnv();
  const { createServiceClient } = await import("../../lib/supabase/server");
  const { runMatching } = await import("../../lib/matching");
  const sb = createServiceClient();
  const summary = await runMatching(sb, {
    lookbackHours: 24 * 400, // created_at 기준 전량(방금 적재분 모두)
    maxArticlesPerRun: 6000, // 상한 해제 — 전 기사 base 처리
    topN: 15, // pgvector 후보 넉넉히
    maxPairs: 12, // base 당 후보 상한 상향
    scoreThreshold: 0.6, // 검수 큐엔 게시 임계(0.6) 이상만 — 비매칭 clutter 방지
    publishedWithinDays: 7,
  });
  console.log("재매칭 완료:", JSON.stringify(summary));
}
main().catch((e) => { console.error(e); process.exit(1); });
