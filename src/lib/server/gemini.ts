import 'server-only';

export type EmbedTaskType = 'RETRIEVAL_QUERY' | 'RETRIEVAL_DOCUMENT';

export class GeminiConfigError extends Error {}

export interface FunctionCallPart {
  functionCall?: { name?: string; args?: Record<string, unknown> };
  functionResponse?: { name?: string; response?: { result: unknown } };
  text?: string;
}

export interface GeminiContent {
  role: 'user' | 'model';
  parts: FunctionCallPart[];
}

export function requireSettings() {
  const apiKey = process.env.GEMINI_API_KEY;
  const chat = process.env.GEMINI_CHAT_MODEL;
  const embed = process.env.GEMINI_EMBED_MODEL;
  if (!apiKey || !chat || !embed) {
    throw new GeminiConfigError('Faltan GEMINI_API_KEY / GEMINI_CHAT_MODEL / GEMINI_EMBED_MODEL');
  }
  return { apiKey, chat, embed };
}

async function geminiFetch(path: string, body: unknown): Promise<{ ok: boolean; status: number; data: unknown }> {
  const { apiKey } = requireSettings();
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, data };
}

function embedValues(embedding: unknown): number[] | null {
  if (embedding && typeof embedding === 'object' && Array.isArray((embedding as { values?: unknown }).values)) {
    return (embedding as { values: number[] }).values;
  }
  return null;
}

/** Embeddings en lote para documentos o la pregunta de búsqueda. */
export async function embedTexts(texts: string[], taskType: EmbedTaskType): Promise<{ texts: string[]; embeddings: number[][] }> {
  const { embed } = requireSettings();
  const requests = texts.map((text) => ({
    model: `models/${embed}`,
    content: { parts: [{ text }] },
    taskType,
  }));
  const res = await geminiFetch(`models/${embed}:batchEmbedContents`, { requests });
  if (!res.ok || !res.data) throw new Error(`embedContent falló (${res.status})`);
  const list = (res.data as { embeddings?: { values?: number[] }[] }).embeddings ?? [];
  const embeddings = list.map((e) => embedValues(e.values) ?? []);
  return { texts, embeddings };
}

export interface GenerateOptions {
  contents: GeminiContent[];
  systemInstruction?: string;
  tools?: unknown[];
  temperature?: number;
}

/** Genera contenido (llamada directa). Devuelve el JSON completo. */
export async function generate(contents: GeminiContent[], systemInstruction?: string, tools?: unknown[], temperature = 0.2) {
  const { chat } = requireSettings();
  const body: Record<string, unknown> = {
    contents,
    generationConfig: { temperature },
  };
  if (systemInstruction) body.systemInstruction = { parts: [{ text: systemInstruction }] };
  if (tools && tools.length) body.tools = tools;
  const res = await geminiFetch(`models/${chat}:generateContent`, body);
  if (!res.ok || !res.data) {
    throw new Error(`generateContent falló (${res.status})`);
  }
  return res.data as {
    candidates?: { content?: { parts?: FunctionCallPart[] } }[];
  };
}

export interface ToolExecutionResult {
  name: string;
  result: unknown;
}

export interface ChatLog {
  text: string;
  toolCalls: ToolExecutionResult[];
}

/**
 * Bucle de function calling: resuelve cada `functionCall` contra el resolver
 * y devuelve una `functionResponse`, con un máximo de `maxTurns`.
 */
export async function runChat(
  opts: {
    messages: GeminiContent[];
    systemInstruction: string;
    tools: unknown[];
    resolveTool: (name: string, args: Record<string, unknown>) => { result: unknown; uiActions?: unknown[] };
    maxTurns?: number;
  },
): Promise<{ chatLog: ChatLog; uiActions: unknown[] }> {
  const { maxTurns = 5 } = opts;
  const contents = [...opts.messages];
  const toolCalls: ToolExecutionResult[] = [];
  const uiActions: unknown[] = [];

  for (let turn = 0; turn < maxTurns; turn++) {
    const data = await generate(contents, opts.systemInstruction, opts.tools);
    const parts = data.candidates?.[0]?.content?.parts ?? [];
    const text = (parts.find((p) => p.text)?.text ?? '').trim();

    const calls = parts.filter((p) => p.functionCall?.name);
    if (calls.length === 0) {
      return { chatLog: { text, toolCalls }, uiActions };
    }

    for (const call of calls) {
      const name = call.functionCall?.name ?? '';
      const args = call.functionCall?.args ?? {};
      const resolved = opts.resolveTool(name, args);
      contents.push({
        role: 'model',
        parts: [{ functionCall: { name, args } }],
      });
      contents.push({
        role: 'user',
        parts: [{ functionResponse: { name, response: { result: resolved.result } } }],
      });
      toolCalls.push({ name, result: resolved.result });
      if (resolved.uiActions) uiActions.push(...resolved.uiActions);
    }
  }

  return { chatLog: { text: '', toolCalls }, uiActions };
}