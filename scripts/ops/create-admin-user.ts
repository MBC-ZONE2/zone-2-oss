// ============================================================================
// scripts/ops/create-admin-user — 관리자 계정(이메일·비밀번호) 발급
//
// 관리자 인증은 자격증명 전용(카카오는 일반 독자용). 역할·소속은 auth.users.app_metadata
// (role·org)가 SSOT 라 여기서 함께 심는다 — 운영자가 로그인만 하면 바로 검수할 수 있다.
//   · super_admin        : 소속 없이 양측 확인
//   · operator_oki       : 옥천신문 기자(org=okinews)
//   · operator_mbc       : MBC충북 기자(org=mbc)
// 비밀번호를 안 주면 임의 16자를 만들어 **한 번만** 출력한다(어디에도 저장하지 않는다).
//   --password= 로 주면 셸 히스토리·프로세스 목록에 남으니, 주려면 ADMIN_INITIAL_PASSWORD 환경변수로.
//   초기 비밀번호는 첫 로그인 뒤 본인이 바꾸게 안내한다(앱에 강제 변경 흐름은 아직 없다).
// 같은 이메일이 이미 있으면 만들지 않고 역할·소속만 맞춘다(멱등) — 단 **이메일 공급자 계정만**.
//   카카오 등 소셜 계정과 이메일이 겹치면 승격하지 않고 멈춘다(관리자 가드는 role 만 보므로 위험).
//
// 실행:
//   pnpm tsx scripts/ops/create-admin-user.ts --email=okinews@mbcok.com --role=operator_oki --name=옥천신문
//   pnpm tsx scripts/ops/create-admin-user.ts --email=mbc@mbcok.com --role=operator_mbc --name=MBC충북 [--password=…]
// 필요 env(.env.local 자동 로드): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// ============================================================================

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { createClient, type User } from "@supabase/supabase-js";

function loadEnv(): void {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separator = trimmed.indexOf("=");
      if (separator === -1) continue;
      const key = trimmed.slice(0, separator).trim();
      if (process.env[key] === undefined) process.env[key] = trimmed.slice(separator + 1).trim();
    }
  } catch {
    // 셸 env 허용
  }
}

type Role = "super_admin" | "operator_oki" | "operator_mbc";
const ORG_OF: Record<Role, "okinews" | "mbc" | null> = {
  super_admin: null,
  operator_oki: "okinews",
  operator_mbc: "mbc",
};

function arg(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
}

/** 읽기 쉬운 임의 비밀번호 — 헷갈리는 글자(0/O, 1/l/I) 제외, 16자 */
function makePassword(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(16);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

async function main(): Promise<void> {
  loadEnv();
  const email = arg("email")?.trim().toLowerCase();
  const role = arg("role") as Role | undefined;
  const name = arg("name")?.trim();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("--email=주소 가 필요합니다.");
  if (!role || !Object.hasOwn(ORG_OF, role)) throw new Error("--role=super_admin|operator_oki|operator_mbc");
  const givenPassword = arg("password") ?? process.env.ADMIN_INITIAL_PASSWORD;
  if (givenPassword !== undefined && givenPassword.length < 8) {
    throw new Error("비밀번호는 8자 이상이어야 합니다(짧은 값을 임의 비밀번호로 바꿔치기하지 않는다).");
  }
  if (!name) throw new Error("--name=표시이름 이 필요합니다.");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("NEXT_PUBLIC_SUPABASE_URL 과 SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.");
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const org = ORG_OF[role];
  const appMeta = org ? { role, org } : { role };
  const userMeta = { name, display_name: name };

  // 멱등 — 이미 있으면 역할·소속·이름만 맞춘다(비밀번호는 건드리지 않는다). 전 페이지를 순회한다.
  let existing: User | undefined;
  for (let page = 1; ; page += 1) {
    const { data: list, error: listErr } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (listErr) throw new Error(`계정 목록 조회 실패: ${listErr.message}`);
    existing = list.users.find((u) => (u.email ?? "").toLowerCase() === email);
    if (existing || list.users.length < 1000) break;
  }
  if (existing) {
    // 이메일 공급자 계정만 승격한다 — 소셜(카카오) 계정이 같은 이메일이면 관리자로 만들지 않는다
    // listUsers 응답에는 identities 가 비어 올 수 있어 GoTrue 가 app_metadata 에 적어 두는 provider(s) 도 본다
    const meta = (existing.app_metadata ?? {}) as { provider?: unknown; providers?: unknown };
    const fromMeta = Array.isArray(meta.providers)
      ? meta.providers.map(String)
      : typeof meta.provider === "string"
        ? [meta.provider]
        : [];
    const providers = (existing.identities ?? []).map((i) => i.provider).concat(fromMeta);
    const emailOnly = providers.length > 0 && providers.every((p) => p === "email");
    if (!emailOnly) {
      throw new Error(
        `같은 이메일의 소셜 계정(${providers.join(",") || "공급자 미상"})이 있습니다 — 승격하지 않습니다. 다른 이메일을 쓰세요.`,
      );
    }
    const { error } = await supabase.auth.admin.updateUserById(existing.id, {
      app_metadata: { ...(existing.app_metadata ?? {}), ...appMeta, org: org ?? null },
      user_metadata: { ...(existing.user_metadata ?? {}), ...userMeta },
      // 확인되지 않은 이메일 계정은 로그인이 막혀 있으니 확인 처리한다
      ...(existing.email_confirmed_at ? {} : { email_confirm: true }),
    });
    if (error) throw new Error(`갱신 실패: ${error.message}`);
    console.log(`이미 있는 계정 — 역할·소속만 맞췄습니다: ${email} → ${role}${org ? ` (${org})` : ""}`);
    return;
  }

  const password = givenPassword ?? makePassword();
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // 메일 발송 없이 바로 로그인 가능
    app_metadata: appMeta,
    user_metadata: userMeta,
  });
  if (error || !data.user) throw new Error(`생성 실패: ${error?.message ?? "no user"}`);

  console.log(`계정 생성: ${email} → ${role}${org ? ` (${org})` : ""} · 이름 ${name}`);
  if (!givenPassword) {
    console.log(`초기 비밀번호(한 번만 표시, 저장 안 함): ${password}`);
  }
}

main().catch((e) => {
  console.error("[create-admin-user] 실패:", e instanceof Error ? e.message : e);
  process.exit(1);
});
