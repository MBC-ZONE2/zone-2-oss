// 온도 전량 재산출(1회) — #81 codex 라벨 반영.
//
// 배경: ensureIssuesFromArticles 는 멱등(기존 label 은 재생성 안 함)이라, 이미
//   들어간 옛 "단어 조각" 이슈(건의문·가격과 등)가 남아 codex 라벨이 반영되지
//   않는다. 이 스크립트는 issues·temperature_scores 를 비운 뒤 재산출을 돌려
//   codex(구독 CLI)가 "지방의원 해외연수 논란" 같은 구문 라벨을 새로 만들게 한다.
//
// 실행: pnpm tsx scripts/ops/recompute-temperature.ts
//   (.env.local 의 서비스 롤 키 + LOCAL_AI_CLI=codex 사용)
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv(): void {
  const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  for (const l of raw.split("\n")) {
    const t = l.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    if (process.env[t.slice(0, i)] === undefined) {
      process.env[t.slice(0, i)] = t.slice(i + 1);
    }
  }
}

async function main(): Promise<void> {
  loadEnv();
  const { createServiceClient } = await import("../../lib/supabase/server");
  const { runTemperatureComputation } = await import(
    "../../lib/temperature/compute"
  );
  const sb = createServiceClient();

  // 0) 옛 산출·이슈 비우기 (codex 라벨로 새로 만들기 위해). scores 가 issues 를
  //    FK 참조하므로 scores → issues 순서. id is not null = 전체 행 매치.
  const delScores = await sb
    .from("temperature_scores")
    .delete()
    .not("id", "is", null);
  if (delScores.error) throw new Error(`scores 삭제 실패: ${delScores.error.message}`);
  const delIssues = await sb.from("issues").delete().not("id", "is", null);
  if (delIssues.error) throw new Error(`issues 삭제 실패: ${delIssues.error.message}`);
  console.log("옛 온도 산출·이슈 비움 완료");

  // 1) 재산출 (내부에서 ensureIssuesFromArticles → codex 라벨 생성 → 점수)
  const result = await runTemperatureComputation();
  console.log("재산출 결과:", JSON.stringify(result));

  // 2) 새로 생긴 이슈 라벨 확인(육안 검수용)
  const { data: issues } = await sb
    .from("issues")
    .select("label, keywords")
    .order("label");
  console.log(`\n새 이슈 ${issues?.length ?? 0}건:`);
  for (const it of (issues ?? []) as { label: string; keywords: string[] }[]) {
    console.log(`  · ${it.label}  [${(it.keywords ?? []).join(", ")}]`);
  }

  // 3) 온도 상위 확인
  const { data: top } = await sb
    .from("temperature_scores")
    .select("rank, temperature, issue_id")
    .order("computed_at", { ascending: false })
    .order("rank")
    .limit(8);
  console.log("\n온도 상위:");
  for (const r of (top ?? []) as {
    rank: number;
    temperature: number;
    issue_id: string;
  }[]) {
    console.log(`  ${r.rank}. ${r.temperature}℃  (issue ${r.issue_id})`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
