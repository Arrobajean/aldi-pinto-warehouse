import { NextResponse } from 'next/server';
import { z } from 'zod';

import { embedTexts, GeminiConfigError, runChat } from '@/lib/server/gemini';
import { retrieveChunks, countRecentUsage, recordUsage } from '@/lib/server/rag';
import { LIVE_TOOLS, resolveTool } from '@/lib/server/tools';
import type { ChatRequest, ChatResponse, UiAction } from '@/lib/chat';

export const runtime = 'nodejs';

const schema = z.object({
  question: z.string().min(1).max(2000),
  history: z
    .array(z.object({ role: z.enum(['user', 'model']), parts: z.string() }))
    .max(12)
    .optional(),
  snapshot: z.object({
    machines: z.array(z.unknown()),
    trucks: z.array(z.unknown()),
    docks: z.array(z.unknown()),
    palets: z.object({ total: z.number(), byState: z.record(z.string(), z.number()), byTemp: z.record(z.string(), z.number()) }),
    alerts: z.array(z.unknown()),
    stats: z.record(z.string(), z.number()),
  }),
});

export async function POST(req: Request) {
  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'Entrada inválida' }, { status: 400 });
  }

  if (!process.env.GEMINI_API_KEY || !process.env.GEMINI_CHAT_MODEL || !process.env.GEMINI_EMBED_MODEL) {
    return NextResponse.json({ error: 'Asistente sin configurar (faltan las variables del servidor).' }, { status: 503 });
  }

  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || undefined;
    const session = req.headers.get('x-session') || undefined;
    await countRecentUsage(ip, session, 3600);
    await recordUsage(ip, session);

    const [{ embeddings }] = await Promise.all([
      embedTexts([body.question], 'RETRIEVAL_QUERY'),
    ]);
    const embedding = embeddings[0];
    if (!embedding || embedding.length === 0) {
      return NextResponse.json({ error: 'No se pudo calcular el embedding de la pregunta.' }, { status: 500 });
    }

    const chunks = await retrieveChunks(embedding, 4, 0.6);

    const systemInstruction = `
Eres el asistente de operaciones logísticas de la plataforma de ALDI en Pinto (Madrid).
Responde SIEMPRE en español, de forma ejecutiva y concisa, usando únicamente:
1) los fragmentos de la base de conocimiento (RAG) que se te entregan, citando su título;
2) los datos en vivo que recuperas con las herramientas (snapshot del estado de la simulación).
No inventes cifras: si no las tienes, dilo. Si piden ubicar una máquina, ubicación o zona, usa
las herramientas y devuelve también la acción ui_actions correspondiente.

FRAGMENTOS RECUPERADOS:
${chunks.map((c) => `[${c.title}]\n${c.content}`).join('\n\n')}
`.trim();

    const messages = [
      ...(body.history ?? []).map((h) => ({ role: h.role, parts: [{ text: h.parts }] })),
      { role: 'user' as const, parts: [{ text: body.question }] },
    ];

    const { chatLog, uiActions } = await runChat({
      messages,
      systemInstruction,
      tools: LIVE_TOOLS,
      resolveTool: (name, args) => resolveTool(name, args, body.snapshot as ChatRequest['snapshot']),
    });

    const sources = chunks.map((c) => ({
      title: c.title,
      category: c.category,
      relevance: Math.round(c.similarity * 100),
      snippet: c.content.slice(0, 180) + '…',
    }));

    const response: ChatResponse = {
      answer: chatLog.text || 'No he podido responder con los datos disponibles.',
      sources,
      ui_actions: (uiActions as UiAction[]) ?? [],
    };
    return NextResponse.json(response);
  } catch (err) {
    if (err instanceof GeminiConfigError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    console.error('chat:', err);
    return NextResponse.json({ error: 'Error procesando la pregunta.' }, { status: 500 });
  }
}