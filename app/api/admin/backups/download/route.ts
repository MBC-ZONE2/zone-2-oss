// ============================================================================
// GET /api/admin/backups/download?kind=db|storage&name=zone2-db-YYYYMMDD.dump — 백업 파일 내려받기(스트리밍)
//
// 가드: system.config(관리자). 이름은 lib/ops/backups 의 정규식에 맞아야 하고 경로는 거기서만 만든다(경로 조작 불가).
// 파일은 O_NOFOLLOW 로 한 번 열어 같은 디스크립터로 크기를 재고 흘려보낸다(심링크·바꿔치기 불가).
// 큰 파일(스토리지 묶음 수백 MB)도 메모리에 올리지 않는다. 2026-10-27
// ============================================================================

import { Readable } from "node:stream";
import type { NextRequest } from "next/server";
import { errorResponse, requirePermission } from "@/lib/auth";
import { isBackupKind, openBackupFile } from "@/lib/ops/backups";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const guard = await requirePermission("system.config");
  if (guard.response) return guard.response;

  const { searchParams } = new URL(request.url);
  const kind = searchParams.get("kind");
  const name = searchParams.get("name") ?? "";
  if (!isBackupKind(kind)) return errorResponse(400, "INVALID_KIND", "kind 는 db|storage 중 하나입니다.");
  const opened = await openBackupFile(kind, name);
  if (!opened) return errorResponse(404, "NOT_FOUND", "그 백업 파일이 없거나 이름 형식이 아닙니다.");

  const stream = Readable.toWeb(opened.handle.createReadStream({ autoClose: true })) as ReadableStream;
  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "application/octet-stream",
      "content-length": String(opened.size),
      "content-disposition": `attachment; filename="${name}"`,
      "cache-control": "no-store",
    },
  });
}
