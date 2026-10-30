// ============================================================================
// lib/ai/local-cli — 로컬 구독 CLI(codex·claude)로 구조화 출력 생성
//
// 배경: 운영은 Mac Studio/Mini self-host 이고, AI API 키 대신 **머신에 로그인된
//   구독 CLI**(codex·claude)를 쓴다는 결정(2026-08-02). 임베딩(local-embed)과
//   TTS(local-tts)는 이미 키 없는 실동작 폴백이 있어, 남은 건 텍스트 생성뿐이다.
//
// 이 모듈은 `generateObject`(AI SDK) 자리를 대신한다 — system·prompt·출력 형식을
//   묶어 CLI 에 stdin 으로 넣고, stdout 에서 JSON 을 뽑아 zod 로 검증한다.
//
// 설계 원칙:
//   - **실패해도 throw 하지 않는다**(null 반환). 호출부가 기존 로컬 폴백으로
//     내려가야 크론이 죽지 않는다.
//   - 배치·크론 경로 전용. CLI 1회 호출은 초 단위라 **사용자 동기 경로엔 쓰지
//     않는다**(공론장 글 작성의 moderate 는 의도적으로 제외).
//
// ⚠️ node 빌트인은 함수 안에서 동적 import 한다. top-level import 하면 Next/
//    webpack 이 lib/ai 전체를 서버 번들에 넣으려다 라우트 빌드가 깨진다
//    (local-tts.ts 와 같은 함정).
// ============================================================================

import type { z } from "zod";

/** 지원 CLI 종류 */
export type LocalCliKind = "codex" | "claude";

/** CLI 호출 타임아웃(ms) — 대본 생성처럼 긴 작업도 있어 넉넉히 잡는다. */
const DEFAULT_TIMEOUT_MS = 180_000;

/** stdout 상한 — 폭주 응답으로 메모리를 먹지 않게. */
const MAX_STDOUT_BYTES = 4 * 1024 * 1024;

/**
 * 설정된 CLI 종류. `LOCAL_AI_CLI=codex|claude` 가 아니면 null(=비활성).
 * 비활성이면 기존 동작(키 있으면 API, 없으면 로컬 폴백)이 그대로 유지된다.
 */
export function localCliKind(): LocalCliKind | null {
  // 명시적 mock(AI_MOCK=1)이면 CLI 비활성(로컬 폴백 경로). 그 외엔 LOCAL_AI_CLI
  // 설정을 따르되, **미설정이면 self-host 기본값 = codex**(키 없이 실 LLM 재랭킹).
  if (process.env.AI_MOCK === "1") return null;
  const raw = process.env.LOCAL_AI_CLI?.trim().toLowerCase();
  if (raw === "codex" || raw === "claude") return raw;
  return "codex";
}

/** 구독 CLI 경로가 켜져 있는지 */
export function isLocalCliMode(): boolean {
  return localCliKind() !== null;
}

/** 실행할 바이너리 (경로 override: LOCAL_AI_CLI_BIN) */
function binaryFor(kind: LocalCliKind): string {
  return process.env.LOCAL_AI_CLI_BIN?.trim() || kind;
}

/**
 * CLI 별 인자. 둘 다 **프롬프트를 stdin 으로** 받는 비대화형 모드다.
 * - codex: `exec` 서브커맨드. 파일을 건드릴 이유가 없으므로 read-only 샌드박스.
 * - claude: `-p`(print) 비대화형.
 */
function argsFor(kind: LocalCliKind): string[] {
  if (kind === "codex") {
    const effort = process.env.LOCAL_AI_CLI_EFFORT?.trim() || "low";
    return [
      "exec",
      "--sandbox",
      "read-only",
      "-c",
      `model_reasoning_effort=${effort}`,
    ];
  }
  return ["-p"];
}

/** 자식 프로세스를 돌려 stdout 을 받는다. 실패 시 null.
 *  빠른 실패(20초 안에 비정상 종료 — 구독 한도·동시 세션 충돌 같은 일시 오류)는 15초 뒤 1회 재시도한다(2026-10-26,
 *  ai_rerank_failed 경보가 codex 리뷰를 동시에 돌리던 시간대에 몰린 것을 보고). 타임아웃(180초)은 재시도하지 않는다. */
async function runCli(input: string): Promise<string | null> {
  const started = Date.now();
  const first = await runCliOnce(input);
  if (first !== null) return first;
  if (Date.now() - started > 20_000) return null;
  console.warn("로컬 CLI 빠른 실패 — 15초 뒤 1회 재시도");
  await new Promise((r) => setTimeout(r, 15_000));
  return runCliOnce(input);
}

async function runCliOnce(input: string): Promise<string | null> {
  const kind = localCliKind();
  if (!kind) return null;

  // webpackIgnore 가 없으면 Next 가 이 모듈을 번들에 넣으려다
  // "node:child_process is not handled" 로 라우트 빌드가 깨진다(local-tts 와 동일).
  const { spawn } = await import(/* webpackIgnore: true */ "node:child_process");
  const timeoutMs =
    Number(process.env.LOCAL_AI_CLI_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;

  return new Promise((resolve) => {
    let child;
    try {
      // detached: 자식(codex)과 그 손자까지 한 프로세스 그룹으로 묶어, 타임아웃
      // 시 그룹째 죽인다(자식 hang 으로 부모가 무한 대기하던 문제 방지).
      child = spawn(binaryFor(kind), argsFor(kind), {
        stdio: ["pipe", "pipe", "pipe"],
        detached: true,
      });
    } catch (error) {
      console.error("로컬 CLI 실행 실패:", error);
      resolve(null);
      return;
    }

    let out = "";
    let err = "";
    let settled = false;

    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };

    const timer = setTimeout(() => {
      try {
        if (child.pid) process.kill(-child.pid, "SIGKILL");
        else child.kill("SIGKILL");
      } catch {
        try {
          child.kill("SIGKILL");
        } catch {
          /* noop */
        }
      }
      console.error(`로컬 CLI 타임아웃(${timeoutMs}ms)`);
      finish(null);
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      if (out.length < MAX_STDOUT_BYTES) out += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      if (err.length < 8192) err += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      console.error("로컬 CLI 오류:", error.message);
      finish(null);
    });
    child.on("close", (code) => {
      if (code !== 0) {
        console.error(`로컬 CLI 비정상 종료(code ${code}): ${err.slice(0, 300)}`);
        finish(null);
        return;
      }
      finish(out);
    });

    child.stdin.on("error", () => {
      /* CLI 가 먼저 죽은 경우 — close 핸들러가 처리한다 */
    });
    child.stdin.end(input, "utf8");
  });
}

/**
 * `start` 위치의 여는 괄호에 대응하는 닫는 괄호까지의 부분 문자열.
 * 문자열 리터럴 안의 괄호·이스케이프를 건너뛴다. 못 찾으면 null.
 */
function balancedSlice(text: string, start: number): string | null {
  const open = text[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * CLI 출력에서 JSON 을 뽑는다. CLI 는 추론 과정·안내문을 함께 뱉으므로
 * ①코드펜스 안을 우선 보고 ②없으면 균형 잡힌 JSON 후보 중 가장 큰 것을 고른다.
 */
export function extractJson(raw: string): unknown {
  const fenced = [...raw.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)]
    .map((m) => m[1].trim())
    .filter(Boolean);

  const candidates: string[] = [];
  for (const block of fenced) candidates.push(block);

  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (ch !== "{" && ch !== "[") continue;
    const slice = balancedSlice(raw, i);
    if (slice) candidates.push(slice);
  }

  let best: unknown = null;
  let bestLength = -1;
  for (const candidate of candidates) {
    try {
      const parsed: unknown = JSON.parse(candidate);
      if (candidate.length > bestLength) {
        best = parsed;
        bestLength = candidate.length;
      }
    } catch {
      /* JSON 이 아닌 후보는 무시 */
    }
  }
  if (bestLength === -1) throw new Error("출력에서 JSON 을 찾지 못했습니다");
  return best;
}

/** CLI 에 넣을 최종 프롬프트 — 형식 지시를 마지막에 둬 잊지 않게 한다. */
function buildPrompt(
  system: string,
  prompt: string,
  format: string,
  retryHint?: string,
): string {
  return [
    system,
    "",
    prompt,
    "",
    "### 출력 형식 (반드시 지킬 것)",
    format,
    "",
    "설명·인사말·코드펜스 없이 **JSON 값 하나만** 출력하라. 파일을 만들지 마라.",
    retryHint ? `\n### 직전 시도 실패 — 반드시 고칠 것\n${retryHint}` : "",
  ]
    .join("\n")
    .trim();
}

/**
 * 구독 CLI 로 구조화 출력을 만든다. `generateObject` 의 대역.
 *
 * @param schema 결과 검증용 zod 스키마
 * @param opts.format JSON 형태 설명(모델이 볼 지시문)
 * @param opts.label 로그 식별용 이름
 * @returns 검증 통과한 값, 실패하면 **null**(호출부가 로컬 폴백으로 내려간다)
 */
export async function generateJsonViaCli<T>(
  schema: z.ZodType<T>,
  opts: { system: string; prompt: string; format: string; label: string },
): Promise<T | null> {
  let retryHint: string | undefined;

  // 1회 재시도: 형식 위반은 지적하면 대체로 고쳐진다.
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const raw = await runCli(
      buildPrompt(opts.system, opts.prompt, opts.format, retryHint),
    );
    if (raw === null) return null; // 실행 자체 실패 — 재시도해도 같다

    try {
      const parsed = schema.safeParse(extractJson(raw));
      if (parsed.success) return parsed.data;
      retryHint = parsed.error.issues
        .slice(0, 5)
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join(" / ");
    } catch (error) {
      retryHint = error instanceof Error ? error.message : String(error);
    }
    console.error(
      `로컬 CLI(${opts.label}) 시도 ${attempt} 형식 불일치: ${retryHint}`,
    );
  }
  return null;
}
