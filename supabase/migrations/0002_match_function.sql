-- ============================================================================
-- ZONE-2 크로스뷰 매칭 RPC (0002_match_function)
-- 출처: lib/matching/candidates.ts — pgvector 코사인 Top-N 후보 조회 RPC.
--
-- candidates.ts 의 supabase.rpc("match_opposite_articles", {...}) 호출과
-- 인자명·반환 컬럼을 1:1로 맞춘다.
--   인자: query_embedding vector(1536), target_source media_source,
--         match_count int, exclude_id uuid
--   반환: articles 컬럼 전체(ArticleRow) + similarity(코사인 유사도 0~1)
--
-- 동작: target_source 매체에서 embedding 이 null 이 아닌 기사 중
--       exclude_id 를 제외하고, query_embedding 과의 pgvector 코사인 유사도
--       내림차순(=거리 오름차순)으로 상위 match_count 건을 반환한다.
--       (articles 의 hnsw(vector_cosine_ops) 인덱스 활용)
-- ============================================================================

create or replace function public.match_opposite_articles(
  query_embedding vector(1536),
  target_source   media_source,
  match_count     int,
  exclude_id      uuid
)
returns table (
  -- articles 컬럼 (mappers.ts ArticleRow 와 동일 순서/이름)
  id           uuid,
  source       media_source,
  kind         article_kind,
  external_id  text,
  url          text,
  title        text,
  body         text,
  category     text,
  keywords     text[],
  published_at timestamptz,
  embedding    vector(1536),
  raw          jsonb,
  created_at   timestamptz,
  -- 코사인 유사도(0~1, 1이 가장 유사). candidates.ts.toSimilarity 가 우선 사용.
  similarity   real
)
language sql
stable
as $$
  select
    a.id,
    a.source,
    a.kind,
    a.external_id,
    a.url,
    a.title,
    a.body,
    a.category,
    a.keywords,
    a.published_at,
    a.embedding,
    a.raw,
    a.created_at,
    -- pgvector `<=>` 는 코사인 거리(0~2). 유사도 = 1 - 거리.
    (1 - (a.embedding <=> query_embedding))::real as similarity
  from public.articles a
  where a.source = target_source
    and a.embedding is not null
    and a.id <> exclude_id
  order by a.embedding <=> query_embedding
  limit greatest(match_count, 0);
$$;

-- 함수 실행 권한: 매칭 Cron 은 service_role 로 호출한다.
grant execute on function public.match_opposite_articles(
  vector(1536), media_source, int, uuid
) to service_role;
