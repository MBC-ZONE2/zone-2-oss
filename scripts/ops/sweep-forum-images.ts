// ============================================================================
// scripts/ops/sweep-forum-images — 공론장 고아 사진 정리를 수동으로 (lib/forum/image-sweep). 크론은 온도 크론 KST 04시.
// 실행: pnpm tsx scripts/ops/sweep-forum-images.ts
// ============================================================================
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sweepOrphanForumImages } from "../../lib/forum/image-sweep";

try {
  for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    if (process.env[k] === undefined) process.env[k] = t.slice(i + 1).trim();
  }
} catch {
  /* 셸 env 허용 */
}

(async () => {
  const { createServiceClient } = await import("../../lib/supabase/server");
  const r = await sweepOrphanForumImages(createServiceClient());
  console.log(`훑음 ${r.scanned} · 참조 ${r.referenced} · 삭제 ${r.removed}${r.errors.length ? ` · 오류 ${r.errors.join(" / ")}` : ""}`);
  if (r.errors.length) process.exit(1);
})();
