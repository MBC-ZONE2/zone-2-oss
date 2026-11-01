#!/usr/bin/env node
// ============================================================================
// scripts/guard-build — `pnpm build` 가 **엉뚱한 워크트리**에서 돌지 않게 막는다
//
// 운영(:3002, launchd kr.zone2.server)은 main 워크트리의 .next 를 그대로 서빙한다. 디자인 워크트리
// (…/zone-2-design, dev :3100)에서 build 를 돌리면 ① 운영에는 아무것도 반영되지 않고 ② dev 의 .next
// 가 덮여 깨진다. 같은 명령이 양쪽에서 똑같이 "성공"하기 때문에 눈으로는 구분이 안 됐다(2026-09-21,
// 2026-10-11 두 차례 재발). 그래서 문장 규칙 대신 코드로 막는다:
//   · 경로에 "zone-2-design" 이 들어 있으면(또는 git 브랜치가 design/* 이면) 거부
//   · 프리뷰용 빌드가 정말 필요하면 ALLOW_DESIGN_BUILD=1 로 한 번만 푼다
// package.json 의 build 가 이 파일을 먼저 실행한다. CI/다른 머신에는 해당 없음(경로·브랜치 조건 불충족).
// ============================================================================

import { execSync } from "node:child_process";

const cwd = process.cwd();
const allow = process.env.ALLOW_DESIGN_BUILD === "1";

function branch() {
  try {
    return execSync("git rev-parse --abbrev-ref HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "";
  }
}

const inDesignDir = /zone-2-design(\/|$)/.test(cwd);
const onDesignBranch = branch().startsWith("design/");

if ((inDesignDir || onDesignBranch) && !allow) {
  console.error(
    [
      "",
      "✖ pnpm build 중단 — 디자인 워크트리에서 운영 빌드를 돌리려 했습니다.",
      `  cwd    : ${cwd}`,
      `  branch : ${branch() || "(git 아님)"}`,
      "  운영 배포는 main 워크트리에서  bash scripts/deploy.sh  로 하세요.",
      "  프리뷰용으로 정말 여기서 빌드해야 하면  ALLOW_DESIGN_BUILD=1 pnpm build",
      "",
    ].join("\n"),
  );
  process.exit(2);
}
