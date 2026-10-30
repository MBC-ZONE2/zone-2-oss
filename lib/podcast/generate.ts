// ============================================================================
// lib/podcast/generate — AI 팟캐스트 생성 파이프라인 오케스트레이터
//
// 흐름 (deliverables/02-AI팟캐스트-기능정의서.md §3):
//   2. 수집      : 최근 24h 기사 + 인기 댓글 TOP10  (collectSources)
//   4. 스크립트  : Claude generatePodcastScript      (lib/ai)
//   4.5 윤문     : humanizeKorean (im-not-ai 룰북, lib/ai)
//   5. QA        : 금칙어 필터 + 마스킹               (checkBannedWords)
//   6. TTS       : OpenAI synthesizeSpeech            (lib/ai)
//   8. 저장      : R2 업로드(placeholder) → podcast_episodes(status=review)
//   8. 검수      : status=review → 관리자 대시보드 큐(/admin)에 노출
//
// 규칙: 외부 API(Claude/OpenAI)는 lib/ai 함수를 "호출"만 한다(구현은 스텁).
//       DB 접근은 lib/supabase service_role 클라이언트로 한다.
// ============================================================================

import {
  generatePodcastScript,
  synthesizeSpeech,
  toKoreanDate,
  type PodcastInput,
} from "@/lib/ai";
import { region } from "@/config/region";
import { humanizeKorean } from "@/lib/ai/humanize-korean";
import { generateEpisodeHeadline } from "@/lib/ai/podcast-headline";
import { createServiceClient } from "@/lib/supabase/server";
import type { EpisodeSourceRefs } from "@/types";
import { collectSources } from "./collect";
import {
  checkBannedWords,
  maskBannedWords,
  DEFAULT_BANNED_WORDS,
} from "./banned-words";
import { uploadAudio, resolveDurationSec, AudioUploadError } from "./storage";
import type { GenerateOptions, GenerateResult } from "./types";

/** KST(UTC+9) 기준 오늘 날짜 "YYYY-MM-DD" */
function todayKst(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

/**
 * 팟캐스트 에피소드를 생성하고 검수 대기(status=review) 상태로 저장한다.
 *
 * 수집된 기사가 없으면 생성하지 않고 예외를 던진다(빈 에피소드 방지).
 */
export async function generateEpisode(
  options: GenerateOptions = {},
): Promise<GenerateResult> {
  const date = options.date ?? todayKst();
  const lookbackHours = options.lookbackHours ?? 24;
  const topComments = options.topComments ?? 10;

  const supabase = createServiceClient();

  // 1. 같은 날짜 에피소드가 이미 있으면 생성하지 않는다(멱등).
  //    크론 재실행·수동 트리거가 겹치면 같은 제목이 두 건 쌓였다(실측: "8월 2일" 2건).
  //    failed 는 재시도 대상이므로 제외한다.
  if (!options.force) {
    const { data: existing, error: dupErr } = await supabase
      .from("podcast_episodes")
      .select("id, status")
      .eq("scheduled_for", date)
      .neq("status", "failed")
      .limit(1)
      .maybeSingle();
    if (dupErr) {
      // 조회 실패로 생성을 막지는 않는다(중복이 무발행보다 낫다).
      console.error("에피소드 중복 검사 실패:", dupErr.message);
    } else if (existing) {
      throw new Error(
        `이미 ${date} 에피소드가 있습니다 (id ${(existing as { id: string }).id}). 재생성하려면 force 옵션을 쓰세요.`,
      );
    }
  }

  // 2~3. 수집 + Dedup — 매체별 몫(#166): 크로스뷰 쌍 → 옥천신문 7일/6건 → MBC충북 lookbackHours/14건.
  //      직전 회차에 투입한 기사는 옥천 몫에서 뒤로 미룬다(주간지라 같은 기사가 며칠째 반복되는 것 완화).
  const excludeIds = await previousEpisodeArticleIds(supabase, date);
  let collected = await collectSources(supabase, { mbcHours: lookbackHours, topComments, excludeIds });

  // 무데이터 폴백(주말·공휴일): MBC 창 안 기사가 없으면 최근 3일(72h)로 창을 넓혀
  // "지난 며칠 소식 회고"로 회차를 채운다 — 무발행보다 회고가 낫다.
  const RECAP_HOURS = 72;
  if (collected.articles.length === 0 && lookbackHours < RECAP_HOURS) {
    const wider = await collectSources(supabase, { mbcHours: RECAP_HOURS, topComments, excludeIds });
    if (wider.articles.length > 0) {
      console.warn(
        `[podcast] ${date}: 최근 ${lookbackHours}h 무데이터 → 최근 ${RECAP_HOURS}h 회고 요약으로 폴백 (기사 ${wider.articles.length}건)`,
      );
      collected = wider;
    }
  }
  const { articles, comments, pairs, okinewsCount, okNotices } = collected;
  console.log(
    `[podcast] ${date}: 투입 ${articles.length}건 — ${region.outlets.micro.name} ${okinewsCount} · ${region.outlets.macro.name} ${articles.length - okinewsCount} · 크로스뷰 쌍 ${pairs.length}${okinewsCount === 0 ? ` · ${region.place.name} 기사 없음(공고 마감 ${okNotices.length}건으로 코너 채움)` : ""}`,
  );

  if (articles.length === 0) {
    throw new Error(
      `생성할 기사가 없습니다 (최근 ${RECAP_HOURS}h까지 확장, 기준일 ${date}).`,
    );
  }

  // 4. Claude 스크립트 생성 — 댓글은 context 로 전달
  const input: PodcastInput = {
    articles,
    date,
    pairs,
    okNotices,
    context: {
      comments: comments.map((c) => ({
        body: c.body,
        likeCount: c.likeCount,
        sentiment: c.sentiment,
      })),
    },
  };
  const { script: draft } = await generatePodcastScript(input);

  // 4.5 한국어 윤문 — im-not-ai 룰북으로 AI 티를 걷어낸다(사용자 지시 2026-09-08). 실패·과윤문이면 초안 그대로
  const humanized = await humanizeKorean(draft, "radio-script");
  if (humanized.changed) console.log(`[podcast] 윤문 적용 — 룰 ${humanized.applied.join(",") || "?"}`);
  const script = humanized.text;

  // 제목은 **서버에서 결정론적으로** 만든다 — AI 가 낸 title 은 쓰지 않는다.
  // 이유: 프롬프트로 방송 날짜를 줘도 모델이 콘텐츠 기준일(전일)로 적어
  // 발행일과 하루 어긋나는 사례가 실측됐다("8/5 발행분 제목이 8월 4일").
  // 청취자는 발행일로 인지하므로 scheduled_for 와 같은 날짜를 쓴다.
  const title = `${region.podcast.seriesName} ${toKoreanDate(date)}`;

  // 5. QA — 금칙어 검사 후 마스킹 (검수자가 맥락 확인 가능하도록 폐기하지 않음)
  const qa = checkBannedWords(script, DEFAULT_BANNED_WORDS);
  const safeScript = qa.ok
    ? script
    : maskBannedWords(script, DEFAULT_BANNED_WORDS);

  // 6. TTS — 오디오 바이너리 생성
  const audio = await synthesizeSpeech(safeScript);

  // source_refs 구성 (사용된 기사/댓글 id)
  const sourceRefs: EpisodeSourceRefs = {
    articleIds: articles.map((a) => a.id),
    commentIds: comments.map((c) => c.id),
    qaHits: qa.hits,
  };

  // 실제 오디오 길이(MP3 메타). 유효한 MP3 가 아니면 글자수 추정으로 폴백한다.
  const durationSec = resolveDurationSec(audio, safeScript);

  // 8a. 에피소드 먼저 insert (id 확보) — 오디오 키 구성에 id 필요
  const { data: inserted, error: insertErr } = await supabase
    .from("podcast_episodes")
    .insert({
      title,
      script: safeScript,
      duration_sec: durationSec,
      source_refs: sourceRefs,
      status: "review",
      scheduled_for: date,
    })
    .select("id")
    .single();

  if (insertErr || !inserted) {
    throw new Error(
      `에피소드 저장 실패: ${insertErr?.message ?? "no row returned"}`,
    );
  }

  const episodeId = (inserted as { id: string }).id;

  // 8b. 오디오 업로드 → audio_url 갱신.
  //     업로드가 실패하면 오디오 없는 에피소드가 검수 큐에 남지 않도록
  //     status='failed' 로 표시하고 에러를 올린다(재생성은 크론 재실행으로).
  let upload;
  try {
    upload = await uploadAudio(audio, episodeId, date);
  } catch (error) {
    await markFailed(supabase, episodeId);
    throw error instanceof AudioUploadError
      ? error
      : new Error(`오디오 업로드 실패: ${errMessage(error)}`);
  }

  const { error: updateErr } = await supabase
    .from("podcast_episodes")
    // audio_key = 실제 저장 위치(서명 URL 발급용) / audio_url = 재생 경로
    .update({ audio_url: upload.url, audio_key: upload.objectPath })
    .eq("id", episodeId);

  if (updateErr) {
    await markFailed(supabase, episodeId);
    throw new Error(`오디오 URL 갱신 실패: ${updateErr.message}`);
  }

  // 8c. 내용 요약 헤드라인(피그마 #4) — 회차와 오디오가 다 저장된 뒤에 codex 로 한 줄을 짓는다.
  //     여기서 실패·지연해도 회차 생성은 이미 끝난 상태다. 실패하면 null 로 남고 화면은 대본
  //     휴리스틱으로 폴백, 팟캐 크론(매시)이 보충한다.
  try {
    const headline = await generateEpisodeHeadline(safeScript, title);
    if (headline) {
      const { error: hlErr } = await supabase
        .from("podcast_episodes")
        .update({ headline })
        .eq("id", episodeId);
      if (hlErr) console.error(`[podcast] ${date}: 헤드라인 저장 실패 — ${hlErr.message}`);
    } else {
      console.warn(`[podcast] ${date}: 헤드라인 생성 실패 — 휴리스틱 폴백, 크론 보충 대기`);
    }
  } catch (e) {
    console.error(`[podcast] ${date}: 헤드라인 생성 예외 —`, errMessage(e));
  }

  // 8d. 검수 대기 — status='review' 로 저장되어 관리자 대시보드 큐(/admin/queue?type=podcast)에 노출된다. 별도 알림 채널 미사용.

  return {
    episodeId,
    title,
    status: "review",
    qaHits: qa.hits,
    articleCount: articles.length,
    commentCount: comments.length,
  };
}

/**
 * 직전 회차(기준일 이전, failed 제외)에 투입한 기사 id — 옥천 몫 반복 완화용. 조회 실패는 빈 배열.
 */
async function previousEpisodeArticleIds(
  supabase: ReturnType<typeof createServiceClient>,
  date: string,
): Promise<string[]> {
  const { data } = await supabase
    .from("podcast_episodes")
    .select("source_refs")
    .neq("status", "failed")
    .lt("scheduled_for", date)
    .order("scheduled_for", { ascending: false })
    .limit(1)
    .maybeSingle();
  const refs = (data as { source_refs?: { articleIds?: unknown } } | null)?.source_refs;
  return Array.isArray(refs?.articleIds) ? refs.articleIds.filter((v): v is string => typeof v === "string") : [];
}

/**
 * 에피소드를 failed 로 표시한다.
 * 표시 자체가 실패해도 원래 에러를 가리지 않도록 삼킨다.
 */
async function markFailed(
  supabase: ReturnType<typeof createServiceClient>,
  episodeId: string,
): Promise<void> {
  await supabase
    .from("podcast_episodes")
    .update({ status: "failed" })
    .eq("id", episodeId);
}

function errMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
