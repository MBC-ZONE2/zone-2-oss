// ============================================================================
// lib/forum/image — 공론장 사진 공통 상수·URL 검사 (서버·클라이언트 공용, 순수)
// ============================================================================

export const FORUM_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/** 'forum' 버킷 공개 URL 접두 — 글 작성 시 image_url 은 이 접두로 시작해야 한다 */
export function forumImagePublicPrefix(): string {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
  return `${base}/storage/v1/object/public/forum/`;
}

/** 우리 버킷의 사진 URL 인가 (경로는 YYYY/MM/uuid.webp 만) */
export function isForumImageUrl(url: string): boolean {
  const prefix = forumImagePublicPrefix();
  if (!prefix.startsWith("http") || !url.startsWith(prefix)) return false;
  return /^\d{4}\/\d{2}\/[0-9a-f-]{36}\.webp$/i.test(url.slice(prefix.length));
}
