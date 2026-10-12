-- F5: base de conocimiento RAG (pgvector) y control de uso del asistente.

create extension if not exists vector with schema extensions;

-- La dimensión `vector(N)` debe coincidir con la variable EMBED_DIM
-- (text-embedding-004 → 768).
create table aldi_pinto.kb_chunks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null,
  content text not null,
  source_url text,
  embedding vector(768),
  content_hash text unique,
  created_at timestamptz not null default now()
);

create index kb_chunks_embedding_idx on aldi_pinto.kb_chunks
  using hnsw (embedding vector_cosine_ops);

-- Recuperación vectorial.
create or replace function aldi_pinto.match_kb_chunks(
  query_embedding vector(768),
  match_count int default 5,
  min_similarity float default 0.7
) returns table (
  id uuid, title text, category text, content text, source_url text, similarity float
) language sql stable as $$
  select id, title, category, content, source_url,
         1 - (embedding <=> query_embedding) as similarity
  from aldi_pinto.kb_chunks
  where 1 - (embedding <=> query_embedding) > min_similarity
  order by embedding <=> query_embedding
  limit match_count;
$$;

alter table aldi_pinto.kb_chunks enable row level security;
create policy "kb_chunks_lectura_publica" on aldi_pinto.kb_chunks
  for select to anon, authenticated using (true);
create policy "kb_chunks_escritura_servicio" on aldi_pinto.kb_chunks
  for all to service_role using (true) with check (true);

-- Límite de uso por IP/sesión para no quemar la cuota de la key compartida.
create table aldi_pinto.chat_usage (
  id bigint generated always as identity primary key,
  ip text,
  session text,
  used_at timestamptz not null default now()
);
alter table aldi_pinto.chat_usage enable row level security;
create policy "chat_usage_servicio" on aldi_pinto.chat_usage
  for all to service_role using (true) with check (true);