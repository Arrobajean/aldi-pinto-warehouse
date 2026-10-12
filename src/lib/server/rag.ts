import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';

export interface KbChunk {
  title: string;
  category: string;
  content: string;
  source_url?: string;
  embedding: number[];
  content_hash: string;
}

/** Recupera los top-k fragmentos más similares. */
export async function retrieveChunks(embedding: number[], matchCount = 4, minSimilarity = 0.7) {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc('match_kb_chunks', {
    query_embedding: embedding,
    match_count: matchCount,
    min_similarity: minSimilarity,
  });
  if (error) throw new Error(`match_kb_chunks: ${error.message}`);
  return (data ?? []) as { id: string; title: string; category: string; content: string; source_url: string | null; similarity: number }[];
}

/** Inserta o actualiza un fragmento por su hash de contenido. */
export async function upsertChunk(chunk: KbChunk) {
  const admin = createAdminClient();
  const { error } = await admin.from('kb_chunks').upsert(
    {
      title: chunk.title,
      category: chunk.category,
      content: chunk.content,
      source_url: chunk.source_url ?? null,
      embedding: chunk.embedding,
      content_hash: chunk.content_hash,
    },
    { onConflict: 'content_hash' },
  );
  if (error) throw new Error(`upsert kb_chunks: ${error.message}`);
}

/** Cuenta usos recientes de una IP/sesión (límite de cuota). */
export async function countRecentUsage(ip: string | undefined, session: string | undefined, windowSeconds: number) {
  const admin = createAdminClient();
  const since = new Date(Date.now() - windowSeconds * 1000).toISOString();
  const q = admin
    .from('chat_usage')
    .select('id', { count: 'exact', head: true })
    .gte('used_at', since);
  if (ip) q.eq('ip', ip);
  if (session) q.eq('session', session);
  const { count, error } = await q;
  if (error) throw new Error(`chat_usage: ${error.message}`);
  return count ?? 0;
}

export async function recordUsage(ip: string | undefined, session: string | undefined) {
  const admin = createAdminClient();
  await admin.from('chat_usage').insert({ ip: ip ?? null, session: session ?? null });
}