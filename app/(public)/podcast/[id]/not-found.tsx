// ============================================================================
// /podcast/[id] — 에피소드 없음 (404)
// ============================================================================

import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function PodcastEpisodeNotFound() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col items-center gap-6 px-6 py-24 text-center">
      <h1 className="text-2xl font-bold">에피소드를 찾을 수 없습니다</h1>
      <p className="text-sm text-foreground/60">
        아직 게시되지 않았거나 삭제된 에피소드일 수 있습니다.
      </p>
      <Link href="/podcast">
        <Button variant="outline">팟캐스트 목록으로 돌아가기</Button>
      </Link>
    </main>
  );
}
