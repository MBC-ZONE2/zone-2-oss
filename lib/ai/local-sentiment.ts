// ============================================================================
// lib/ai/local-sentiment — 한국어 감정분류 로컬 모델 호출 (Python 사이드카)
//
// 감정분류는 고빈도·좁은 분류 작업이라 LLM(구독 CLI)보다 전용 모델이 낫다:
// 수십 ms/건 · 무료 · **결정적**(같은 입력 → 같은 라벨). 온도 수식의 β(감정
// 분산) 성분이 이 값에 직접 걸려 있다(#81).
//
// 모델은 KcELECTRA 기반 11감정 분류기(= 네이버 뉴스 **댓글** 도메인)를 쓰고,
// pos/neg/neu 로 접는 매핑은 Python 쪽(scripts/sentiment/classify_ko.py)에 둔다
// — 모델 라벨과 매핑을 한 파일에 붙여 둬야 모델을 바꿀 때 같이 움직인다.
//
// ⚠️ self-host 전용(자식 프로세스). Cloudflare Workers 경로에선 못 쓴다.
// ⚠️ node 빌트인 동적 import 에는 반드시 /* webpackIgnore: true */ (local-tts·
//    local-cli 와 같은 함정 — 없으면 라우트 빌드가 깨진다).
// ============================================================================

import type { Sentiment } from "@/types";

/** 사이드카 스크립트 경로 (리포 루트 기준) */
const SCRIPT_PATH = "scripts/sentiment/classify_ko.py";

/** 모델 첫 호출은 가중치 다운로드가 붙어 오래 걸린다. */
const DEFAULT_TIMEOUT_MS = 300_000;

/** 로컬 감정 모델을 쓸지. `LOCAL_SENTIMENT=1` 로 켠다(기본 꺼짐). */
export function isLocalSentimentMode(): boolean {
  return process.env.LOCAL_SENTIMENT === "1";
}

/** 실행할 python 바이너리 (venv 경로 등을 넣는다) */
function pythonBin(): string {
  return process.env.LOCAL_SENTIMENT_PY?.trim() || "python3";
}

/** 사이드카 응답 형태 */
interface SidecarResult {
  labels?: unknown;
  error?: unknown;
}

/**
 * 한국어 감정분류 로컬 모델로 배치 분류한다.
 *
 * @returns 입력 순서와 같은 길이의 라벨 배열. **실패하면 null** —
 *   호출부가 구독 CLI → mock 순으로 내려가야 크론이 죽지 않는다.
 */
export async function classifySentimentLocally(
  texts: string[],
): Promise<Sentiment[] | null> {
  if (texts.length === 0) return [];

  const { spawn } = await import(/* webpackIgnore: true */ "node:child_process");
  const timeoutMs =
    Number(process.env.LOCAL_SENTIMENT_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;

  const raw = await new Promise<string | null>((resolve) => {
    let child;
    try {
      child = spawn(pythonBin(), [SCRIPT_PATH], {
        cwd: process.cwd(),
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (error) {
      console.error("감정 모델 실행 실패:", error);
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
      child.kill("SIGKILL");
      console.error(`감정 모델 타임아웃(${timeoutMs}ms)`);
      finish(null);
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      out += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      if (err.length < 4096) err += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      console.error("감정 모델 오류:", error.message);
      finish(null);
    });
    child.on("close", (code) => {
      // 종료코드가 1이어도 stdout 에 {"error":…} 가 실려 오므로 파싱은 시도한다.
      if (code !== 0 && !out.trim()) {
        console.error(`감정 모델 비정상 종료(code ${code}): ${err.slice(0, 300)}`);
        finish(null);
        return;
      }
      finish(out);
    });

    child.stdin.on("error", () => {
      /* 사이드카가 먼저 죽은 경우 — close 핸들러가 처리한다 */
    });
    child.stdin.end(JSON.stringify(texts), "utf8");
  });

  if (raw === null) return null;

  let parsed: SidecarResult;
  try {
    parsed = JSON.parse(raw.trim()) as SidecarResult;
  } catch {
    console.error("감정 모델 출력 파싱 실패:", raw.slice(0, 200));
    return null;
  }

  if (parsed.error) {
    console.error("감정 모델 오류:", String(parsed.error).slice(0, 300));
    return null;
  }

  const labels = parsed.labels;
  if (!Array.isArray(labels) || labels.length !== texts.length) {
    console.error(
      `감정 모델 결과 개수 불일치: 입력 ${texts.length} vs 출력 ${
        Array.isArray(labels) ? labels.length : "비배열"
      }`,
    );
    return null;
  }

  // 계약 밖 값이 오면 조용히 통과시키지 않고 중립으로 접는다.
  return labels.map((l) =>
    l === "pos" || l === "neg" || l === "neu" ? l : "neu",
  );
}
