// ============================================================================
// GET /api/podcast/[id]/audio — 팟캐스트 오디오 재생 (REQ-010)
//
// 오디오 버킷은 비공개다(마이그레이션 0007). 검수 대기(review)·실패(failed)
// 에피소드의 음원이 공개되면 안 되므로, 이 라우트가 게이트 역할을 한다:
//   1) anon 클라이언트로 에피소드를 조회 → RLS 가 published 만 통과시킨다
//   2) service_role 로 단기 서명 URL 을 만들어 302 리다이렉트
//
// 관리자 미리듣기는 별도 경로가 필요하다(현재 미구현) — 검수 화면에서
// 음원을 들어야 하면 관리자 인증을 확인하는 라우트를 따로 두어야 한다.
// ============================================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** 서명 URL 유효기간(초) — 재생 시작에 충분하면서 공유 링크로 남지 않을 만큼 짧게 */
const SIGNED_URL_TTL_SEC = 300;

const BUCKET = "podcast";

function errorResponse(status: number, message: string): NextResponse {
  return NextResponse.json({ data: null, error: { message } }, { status });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    // 1) 공개 가시성 확인 — RLS(status='published')에 판단을 위임한다.
    const supabase = await createClient();
    const { data: episode, error } = await supabase
      .from("podcast_episodes")
      .select("id, audio_key")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.error("에피소드 조회 실패:", error.message);
      return errorResponse(500, "에피소드를 불러오지 못했습니다.");
    }
    // 미발행·미존재를 구분하지 않는다 — 존재 여부 자체를 흘리지 않기 위함.
    if (!episode) return errorResponse(404, "에피소드를 찾을 수 없습니다.");

    const key = (episode as { audio_key: string | null }).audio_key;
    if (!key) return errorResponse(404, "오디오가 아직 준비되지 않았습니다.");

    // 2) 단기 서명 URL 발급 (service_role — 비공개 버킷 접근)
    const service = createServiceClient();
    const { data: signed, error: signErr } = await service.storage
      .from(BUCKET)
      .createSignedUrl(key, SIGNED_URL_TTL_SEC);

    if (signErr || !signed?.signedUrl) {
      console.error("서명 URL 발급 실패:", signErr?.message);
      return errorResponse(500, "오디오 주소를 만들지 못했습니다.");
    }

    // 3) 리다이렉트 대신 서버가 스토리지에서 받아 스트리밍한다.
    //    (스토리지 호스트가 내부(127.0.0.1)여도, 외부 클라이언트는 이 라우트만
    //     거치므로 재생된다. Range 를 전달해 탐색(seek)을 지원한다.)
    const range = request.headers.get("range");
    const upstream = await fetch(signed.signedUrl, {
      headers: range ? { Range: range } : {},
      cache: "no-store",
    });
    if (!upstream.ok && upstream.status !== 206) {
      console.error("스토리지 오디오 조회 실패:", upstream.status);
      return errorResponse(502, "오디오를 가져오지 못했습니다.");
    }

    const headers = new Headers();
    headers.set(
      "Content-Type",
      upstream.headers.get("content-type") ?? "audio/mpeg",
    );
    headers.set("Accept-Ranges", "bytes");
    const contentLength = upstream.headers.get("content-length");
    if (contentLength) headers.set("Content-Length", contentLength);
    const contentRange = upstream.headers.get("content-range");
    if (contentRange) headers.set("Content-Range", contentRange);
    // 음원은 불변이라 길게 캐시(비공개).
    headers.set("Cache-Control", "private, max-age=3600");

    return new NextResponse(upstream.body, {
      status: upstream.status, // 206(부분) 또는 200
      headers,
    });
  } catch (error) {
    console.error("오디오 서빙 실패:", error);
    return errorResponse(500, "오디오를 제공하지 못했습니다.");
  }
}
