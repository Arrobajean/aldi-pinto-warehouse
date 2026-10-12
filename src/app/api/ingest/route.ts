import { NextResponse } from 'next/server';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { embedTexts } from '@/lib/server/gemini';
import { upsertChunk } from '@/lib/server/rag';

export const runtime = 'nodejs';

function chunkMarkdown(content: string, title: string, category: string, sourceUrl: string | undefined, maxWords = 750, overlap = 80) {
  const words = content.split(/\s+/);
  const chunks: { title: string; category: string; content: string; source_url?: string }[] = [];
  if (words.length <= maxWords) {
    chunks.push({ title, category, content, ...(sourceUrl ? { source_url: sourceUrl } : {}) });
    return chunks;
  }
  for (let start = 0; start < words.length; start += maxWords - overlap) {
    const slice = words.slice(start, start + maxWords);
    chunks.push({
      title: `${title} (${Math.floor(start / (maxWords - overlap)) + 1})`,
      category,
      content: slice.join(' '),
      ...(sourceUrl ? { source_url: sourceUrl } : {}),
    });
  }
  return chunks;
}

// TODO: tokens en vez de palabras (los límites están bien para un primer pase).
export async function POST(req: Request) {
  const secret = req.headers.get('x-ingest-secret');
  if (!process.env.INGEST_SECRET || secret !== process.env.INGEST_SECRET) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const kbDir = path.join(process.cwd(), 'kb');
  const files = (await readdir(kbDir)).filter((f) => f.endsWith('.md'));
  const docs: { file: string; title: string; category: string; content: string }[] = [];
  for (const file of files) {
    const raw = await readFile(path.join(kbDir, file), 'utf8');
    // Primer encabezado = título; si no, nombre del fichero.
    const titleMatch = /^#\s+(.+)$/m.exec(raw);
    const title = titleMatch?.[1] ?? file.replace(/\.md$/, '');
    docs.push({ file, title, category: 'kb', content: raw.replace(/^#\s+.+$/m, '').trim() });
  }

  const allChunks = docs.flatMap((d) => chunkMarkdown(d.content, d.title, d.category, `kb/${d.file}`));
  const toHash = (s: string) => {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return `h${Math.abs(h).toString(36)}`;
  };

  const { embeddings } = await embedTexts(allChunks.map((c) => c.content), 'RETRIEVAL_DOCUMENT');

  let inserted = 0;
  for (let i = 0; i < allChunks.length; i++) {
    const emb = embeddings[i];
    if (!emb || emb.length === 0) continue;
    await upsertChunk({
      ...allChunks[i],
      embedding: emb,
      content_hash: toHash(allChunks[i].content),
    });
    inserted++;
  }

  return NextResponse.json({ ok: true, files: files.length, chunks: allChunks.length, inserted });
}