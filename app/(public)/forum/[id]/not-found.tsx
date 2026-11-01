// ============================================================================
// /forum/[id] — 게시글 없음 (404, F1 토큰)
// ============================================================================

import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function ForumPostNotFound() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col items-center gap-6 px-6 py-24 text-center">
      <h1 className="text-h1 font-bold">게시글을 찾을 수 없습니다</h1>
      <p className="text-sm text-muted-foreground">
        삭제되었거나 검토 중인 게시글일 수 있습니다.
      </p>
      <Link href="/forum">
        <Button variant="outline">공론장으로 돌아가기</Button>
      </Link>
    </main>
  );
}
