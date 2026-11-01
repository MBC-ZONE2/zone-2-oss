// ============================================================================
// lib/forum/image-sweep — 공론장 사진 고아 파일 정리 (대표 지시 2026-10-19)
//
// 글을 쓰다 말면(사진은 올라갔는데 글은 안 올라감) 'forum' 버킷에 아무 글도 가리키지 않는 파일이 남는다.
// 하루 한 번(온도 크론, KST 04시대 첫 슬롯) 버킷의 월 폴더를 훑어 forum_posts.image_url 에 없는 객체 중
// 올린 지 6시간이 지난 것을 지운다 — 6시간은 "지금 쓰는 중인 글"의 사진을 지우지 않기 위한 여유.
// 글 삭제 시에는 softDelete 가 즉시 지우므로(lib/forum/interactions) 여기선 '미참조' 만 본다.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "forum";
const GRACE_MS = 6 * 60 * 60 * 1000;
const PAGE = 100;
/** 오늘 포함 몇 달치 폴더를 훑을지 — 글 삭제·실패분은 최근에 몰린다 */
const MONTHS_BACK = 3;

export interface SweepResult {
  scanned: number;
  referenced: number;
  removed: number;
  errors: string[];
}

function monthDirs(now: Date, back: number): string[] {
  const out: string[] = [];
  for (let i = 0; i <= back; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push(`${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

/** 버킷 객체 중 어느 글도 참조하지 않고 6시간 지난 것을 지운다. 실패는 모아 돌려준다(throw 없음). */
export async function sweepOrphanForumImages(svc: SupabaseClient, now = new Date()): Promise<SweepResult> {
  const res: SweepResult = { scanned: 0, referenced: 0, removed: 0, errors: [] };
  // 참조 중인 경로 집합 — image_url 의 버킷 뒤 경로
  const refs = new Set<string>();
  const { data: rows, error: rowsErr } = await svc.from("forum_posts").select("image_url").not("image_url", "is", null);
  if (rowsErr) {
    res.errors.push(`forum_posts 조회 실패: ${rowsErr.message}`);
    return res;
  }
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  for (const r of (rows ?? []) as { image_url: string | null }[]) {
    const u = r.image_url ?? "";
    const i = u.indexOf(marker);
    if (i !== -1) refs.add(u.slice(i + marker.length));
  }
  res.referenced = refs.size;

  const toRemove: string[] = [];
  for (const dir of monthDirs(now, MONTHS_BACK)) {
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await svc.storage.from(BUCKET).list(dir, { limit: PAGE, offset, sortBy: { column: "created_at", order: "asc" } });
      if (error) {
        res.errors.push(`${dir} 목록 실패: ${error.message}`);
        break;
      }
      const files = (data ?? []).filter((f) => f.name && !f.name.endsWith("/") && f.id);
      res.scanned += files.length;
      for (const f of files) {
        const path = `${dir}/${f.name}`;
        const created = f.created_at ? Date.parse(f.created_at) : 0;
        if (refs.has(path)) continue;
        if (created && now.getTime() - created < GRACE_MS) continue;
        toRemove.push(path);
      }
      if ((data ?? []).length < PAGE) break;
    }
  }
  for (let i = 0; i < toRemove.length; i += 100) {
    const chunk = toRemove.slice(i, i + 100);
    const { error } = await svc.storage.from(BUCKET).remove(chunk);
    if (error) res.errors.push(`삭제 실패(${chunk.length}건): ${error.message}`);
    else res.removed += chunk.length;
  }
  return res;
}
