// ============================================================================
// lib/supabase/fetch-all — PostgREST max_rows 절단을 우회하는 페이지 로더
//
// self-hosted PostgREST 는 PGRST_DB_MAX_ROWS(=1000, supabase/config.toml max_rows)
// 를 넘는 요청을 에러 없이 앞 1000행으로 잘라 돌려준다(206 Partial Content).
// `.limit(5000)` 은 5000행을 보장하지 않는다. 이 헬퍼는 `.range()` 로 실제 요청한
// 상한까지 페이지를 이어 받아 "요청한 만큼" 받아온다.
//   사고 기록: 2026-09-03 04:11 공론 온도가 전부 0도 — 7일 윈도 댓글이 1000건을
//   넘자 유일한 매칭 댓글이 절단 밖으로 밀려 매칭 0건이 된 것이 원인.
// ============================================================================

interface PageResult<T> {
  data: T[] | null;
  error: { message: string } | null;
}

/** PostgREST 가 한 번에 돌려주는 최대 행수(config.toml max_rows 와 동일). */
export const POSTGREST_PAGE = 1000;

/**
 * `page(from, to)` 를 반복 호출해 최대 `max` 행까지 이어 붙인다.
 * page 는 정렬이 고정된 쿼리에 `.range(from, to)` 를 붙여 반환해야 한다.
 */
export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<PageResult<T>>,
  opts: { max: number; label: string; pageSize?: number },
): Promise<T[]> {
  const size = Math.max(1, Math.min(opts.pageSize ?? POSTGREST_PAGE, POSTGREST_PAGE));
  const out: T[] = [];
  for (let from = 0; from < opts.max; from += size) {
    const to = Math.min(from + size, opts.max) - 1;
    const { data, error } = await page(from, to);
    if (error) throw new Error(`${opts.label} 로드 실패: ${error.message}`);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < to - from + 1) break; // 마지막 페이지
  }
  return out;
}
