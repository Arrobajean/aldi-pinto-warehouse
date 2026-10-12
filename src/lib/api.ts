import type { ChatRequest, ChatResponse } from '@/lib/chat';
import { generateRagAnswer } from '@/rag/ragEngine';

/**
 * Plan B sin conexión: la búsqueda local por palabras clave que ya existía
 * en el proyecto (no llama a ninguna API).
 */
export async function localFallback(question: string): Promise<ChatResponse> {
  const res = await generateRagAnswer(question);
  return {
    answer: res.answer,
    sources: res.sources.map((s) => ({ title: s.title, category: s.category, relevance: s.relevance, snippet: s.snippet })),
    ui_actions: [],
  };
}

/** Cliente HTTP del asistente (route handler `/api/chat`). */
export async function postChat(req: ChatRequest): Promise<ChatResponse> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data.error) message = data.error;
    } catch {
      // cuerpo no JSON
    }
    throw new Error(message);
  }
  return (await res.json()) as ChatResponse;
}