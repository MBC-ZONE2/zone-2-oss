// ============================================================================
// /crossview/[id] — 크로스뷰 없음 (404)
// ============================================================================

import Link from "next/link";

export default function CrossviewNotFound() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col items-center gap-6 px-6 py-24 text-center">
      <h1 className="font-display text-display font-black tracking-tight text-foreground">
        크로스뷰를 찾을 수 없습니다
      </h1>
      <p className="text-sm text-muted-foreground">
        삭제되었거나 아직 검수 중인 페어일 수 있습니다.
      </p>
      <Link
        href="/crossview"
        className="inline-flex min-h-11 items-center rounded-md border border-line bg-surface px-4 text-sm font-semibold text-foreground transition-colors hover:border-action/40 hover:text-action focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        크로스뷰 목록으로 돌아가기
      </Link>
    </main>
  );
}
