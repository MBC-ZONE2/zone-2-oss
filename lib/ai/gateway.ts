// ============================================================================
// lib/ai/gateway — Cloudflare AI Gateway 경유 AI SDK 클라이언트 팩토리
//
// 출처: docs/06-API명세.md §6 (외부 API 연동), §7 (AI 함수) / docs/03-기술스택.md §2
// AI 호출(Claude / OpenAI)은 Cloudflare AI Gateway 설정이 있으면 경유하고,
// 없으면 공급자(api.anthropic.com / api.openai.com)를 직접 호출한다.
//   - 게이트웨이 경유 시: 타임아웃 / 재시도 / 캐싱 / 사용량 로깅을 통합 처리.
//   - 직접 호출: 로컬 검증(#4)에서 게이트웨이 없이 공급자 키만으로 실호출.
//   - 인증 토큰 및 공급자 키는 환경변수로 주입한다.
//
// 구현 방식: Vercel AI SDK provider 의 `baseURL` 오버라이드.
//   - createAnthropic / createOpenAI 에 게이트웨이 엔드포인트를 baseURL 로 지정.
//   - 게이트웨이 보호용 토큰은 `cf-aig-authorization` 헤더로 전달.
//   - 공급자 키(x-api-key / Authorization)는 각 provider 가 자동 주입한다.
// ============================================================================

import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";

/** AI 공급자 구분 */
export type AiProvider = "anthropic" | "openai";

/** Cloudflare AI Gateway 호스트 (공통 prefix). */
const GATEWAY_HOST = "https://gateway.ai.cloudflare.com/v1";

// ---------------------------------------------------------------------------
// 기본 모델 ID (docs/03-기술스택.md §2)
//   - Claude: 재랭킹/요약/감정/스크립트/모더레이션. 대량 분류는 Haiku 로 비용 절감.
//   - OpenAI: 임베딩(text-embedding-3-small, 1536차원) / TTS(gpt-4o-mini-tts).
// ---------------------------------------------------------------------------

/** Claude 기본 모델 (요약·재랭킹·스크립트 등 품질 우선 작업). */
export const CLAUDE_MODEL = "claude-3-5-sonnet-latest";
/** Claude 경량 모델 (대량 배치 분류·모더레이션 — 비용/지연 절감). */
export const CLAUDE_FAST_MODEL = "claude-3-5-haiku-latest";
/** OpenAI 임베딩 모델 (articles.embedding = vector(1536) 와 일치). */
export const OPENAI_EMBEDDING_MODEL = "text-embedding-3-small";
/** OpenAI TTS 모델. */
export const OPENAI_TTS_MODEL = "gpt-4o-mini-tts";

/**
 * AI Gateway 런타임 설정. 환경변수에서 읽어온다.
 *   - AI_GATEWAY_ACCOUNT_ID: Cloudflare 계정 ID (게이트웨이 URL 구성)
 *   - AI_GATEWAY_ID        : AI Gateway 이름/ID (게이트웨이 URL 구성)
 *   - AI_GATEWAY_TOKEN     : Cloudflare AI Gateway 인증 토큰 (게이트웨이 보호용)
 *   - ANTHROPIC_API_KEY    : Claude (messages API) 공급자 키
 *   - OPENAI_API_KEY       : OpenAI (임베딩 / TTS) 공급자 키
 */
export interface GatewayConfig {
  accountId: string;
  gatewayId: string;
  gatewayToken: string;
  anthropicApiKey: string;
  openaiApiKey: string;
}

/**
 * 환경변수에서 게이트웨이 설정을 읽는다.
 * 누락된 키가 있으면 명시적으로 실패시켜 잘못된 배포를 조기에 차단한다.
 * (mock 모드 판정은 호출부에서 먼저 수행하므로, 여기 도달 시 실제 호출 경로다.)
 */
export function getGatewayConfig(): GatewayConfig {
  const accountId = process.env.AI_GATEWAY_ACCOUNT_ID;
  const gatewayId = process.env.AI_GATEWAY_ID;
  const gatewayToken = process.env.AI_GATEWAY_TOKEN;
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  const openaiApiKey = process.env.OPENAI_API_KEY;

  const missing: string[] = [];
  if (!accountId) missing.push("AI_GATEWAY_ACCOUNT_ID");
  if (!gatewayId) missing.push("AI_GATEWAY_ID");
  if (!gatewayToken) missing.push("AI_GATEWAY_TOKEN");
  if (!anthropicApiKey) missing.push("ANTHROPIC_API_KEY");
  if (!openaiApiKey) missing.push("OPENAI_API_KEY");

  if (missing.length > 0) {
    throw new Error(
      `AI Gateway 환경변수가 설정되지 않았습니다: ${missing.join(", ")}`,
    );
  }

  return {
    accountId: accountId!,
    gatewayId: gatewayId!,
    gatewayToken: gatewayToken!,
    anthropicApiKey: anthropicApiKey!,
    openaiApiKey: openaiApiKey!,
  };
}

/**
 * (선택) Cloudflare AI Gateway 설정 — account/id/token 3개가 모두 있을 때만 경유.
 * 3개 모두 없으면 null → 공급자(api.anthropic.com / api.openai.com) 직접 호출.
 * (#4 로컬 검증 편의: Gateway 부담 없이 키만으로 실호출 가능. docs/06 §6 직접호출 옵션)
 *
 * 일부만 설정된 경우는 명시적으로 실패시킨다 — 오타·누락으로 게이트웨이 통제
 * (로깅·캐싱·보호 토큰)를 조용히 우회하는 배포를 조기에 차단하기 위함.
 */
function readOptionalGateway():
  | { accountId: string; gatewayId: string; gatewayToken: string }
  | null {
  const accountId = process.env.AI_GATEWAY_ACCOUNT_ID;
  const gatewayId = process.env.AI_GATEWAY_ID;
  const gatewayToken = process.env.AI_GATEWAY_TOKEN;
  if (accountId && gatewayId && gatewayToken) {
    return { accountId, gatewayId, gatewayToken };
  }
  if (!accountId && !gatewayId && !gatewayToken) {
    return null; // 완전 미설정 → 직접 호출 (의도된 로컬 검증 경로)
  }
  const missing = [
    !accountId && "AI_GATEWAY_ACCOUNT_ID",
    !gatewayId && "AI_GATEWAY_ID",
    !gatewayToken && "AI_GATEWAY_TOKEN",
  ].filter(Boolean);
  throw new Error(
    `AI Gateway 환경변수가 일부만 설정되었습니다 (누락: ${missing.join(", ")}). ` +
      "3종을 모두 설정하거나(게이트웨이 경유) 모두 비우세요(직접 호출).",
  );
}

/**
 * Anthropic(Claude) provider 생성. Gateway 설정이 있으면 경유, 없으면 직접 호출.
 */
export function getAnthropic() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY 가 설정되지 않았습니다");
  }
  const gw = readOptionalGateway();
  if (!gw) {
    return createAnthropic({ apiKey }); // Gateway 미설정 → api.anthropic.com 직접
  }
  return createAnthropic({
    apiKey,
    baseURL: `${GATEWAY_HOST}/${gw.accountId}/${gw.gatewayId}/anthropic/v1`,
    headers: { "cf-aig-authorization": `Bearer ${gw.gatewayToken}` },
  });
}

/**
 * OpenAI provider 생성. Gateway 설정이 있으면 경유, 없으면 직접 호출.
 * `.embedding(id)` / `.speech(id)` 등 모달리티별 모델 팩토리를 제공한다.
 */
export function getOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY 가 설정되지 않았습니다");
  }
  const gw = readOptionalGateway();
  if (!gw) {
    return createOpenAI({ apiKey }); // Gateway 미설정 → api.openai.com 직접
  }
  return createOpenAI({
    apiKey,
    baseURL: `${GATEWAY_HOST}/${gw.accountId}/${gw.gatewayId}/openai`,
    headers: { "cf-aig-authorization": `Bearer ${gw.gatewayToken}` },
  });
}

// ---------------------------------------------------------------------------
// 저수준 fetch 헬퍼 (placeholder, 하위호환 유지용)
//
// 실제 호출은 위 AI SDK provider(getAnthropic/getOpenAI) 경로를 사용한다.
// 아래 callGateway 는 SDK 가 다루지 못하는 원시 호출이 필요할 때를 위한 자리만
// 남겨둔 placeholder 이며, 현재 lib/ai 함수들은 사용하지 않는다.
// ---------------------------------------------------------------------------

/** 단일 게이트웨이 raw 호출 옵션 */
export interface GatewayRequest {
  provider: AiProvider;
  /** 공급자 기준 경로 (예: "/messages", "/embeddings") */
  path: string;
  body: unknown;
  /** 게이트웨이 캐시 키 (동일 입력 캐싱용) */
  cacheKey?: string;
  /** 호출 타임아웃(ms). */
  timeoutMs?: number;
}

/**
 * Cloudflare AI Gateway 를 경유한 원시 fetch 호출(placeholder).
 * 일반 경로는 AI SDK provider(getAnthropic/getOpenAI)를 사용하라.
 */
export async function callGateway<T = unknown>(
  request: GatewayRequest,
): Promise<T> {
  void request;
  throw new Error(
    "callGateway: AI SDK provider(getAnthropic/getOpenAI) 경로를 사용하세요",
  );
}
