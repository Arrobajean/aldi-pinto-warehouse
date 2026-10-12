'use client';

import { Bot, MessageSquare, Send, X, ChevronDown } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import type { ChatMsg } from '@/hooks/use-assistant';

interface ChatPanelProps {
  open: boolean;
  onToggle: () => void;
  messages: ChatMsg[];
  loading: boolean;
  onSend: (text: string) => void;
}

export function ChatPanel({ open, onToggle, messages, loading, onSend }: ChatPanelProps) {
  const [text, setText] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSend(text);
    setText('');
  };

  if (!open) {
    return (
      <button
        onClick={onToggle}
        className="absolute right-3 top-[70px] z-50 flex h-10 w-10 items-center justify-center rounded-full border border-accent/60 bg-panel text-accent shadow-card transition-colors hover:bg-panel-strong"
        title="Asistente IA"
      >
        <MessageSquare size={17} />
      </button>
    );
  }

  return (
    <div className="pointer-events-auto absolute right-3 top-[70px] z-50 flex w-80 max-w-[calc(100vw-24px)] flex-col rounded-card border border-line bg-panel/95 shadow-card backdrop-blur">
      <header className="flex items-center gap-2 border-b border-line px-3 py-2.5">
        <Bot size={16} className="text-accent" />
        <h3 className="text-[13px] font-semibold text-fg">Asistente de operaciones</h3>
        <span className="rounded-md bg-panel-strong px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-muted">RAG · estado en vivo</span>
        <button className="ml-auto p-0.5 text-muted hover:text-fg" onClick={onToggle}>
          <X size={15} />
        </button>
      </header>

      <div className="flex min-h-[220px] max-h-[46vh] flex-col gap-2 overflow-y-auto p-2.5 text-[12px] leading-relaxed">
        {messages.length === 0 && (
          <p className="px-1 py-2 text-muted">
            Pregunta por el almacén o su estado en vivo: “¿Dónde está la R-07?”, “¿Cómo va el muelle 12?”,
            “¿Qué cámaras hay desatendidas?”…
          </p>
        )}
        {messages.map((m) => (
          <Bubble key={m.id} msg={m} />
        ))}
        {loading && (
          <div className="self-start rounded-lg rounded-tl-sm border border-line bg-panel-strong px-2.5 py-1.5 text-muted">
            Pensando…
          </div>
        )}
      </div>

      <form onSubmit={submit} className="flex items-center gap-1.5 border-t border-line p-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Pregunta por el almacén…"
          className="h-8 flex-1 rounded-lg border border-line bg-panel-strong px-2.5 text-xs text-fg placeholder:text-muted focus:border-accent focus:outline-none"
        />
        <button type="submit" className="flex h-8 w-9 items-center justify-center rounded-lg border border-line bg-panel-strong text-accent hover:border-accent">
          <Send size={14} />
        </button>
      </form>
    </div>
  );
}

function Bubble({ msg }: { msg: ChatMsg }) {
  const [showSources, setShowSources] = useState(false);
  const isUser = msg.sender === 'user';

  return (
    <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
      <div
        className={`max-w-[92%] whitespace-pre-wrap rounded-lg px-2.5 py-2 ${
          isUser ? 'rounded-tr-sm bg-accent/15 text-fg' : 'rounded-tl-sm border border-line bg-panel-strong text-fg'
        }`}
      >
        {msg.text}
      </div>
      {msg.sources && msg.sources.length > 0 && (
        <>
          <button
            className="mt-1 flex items-center gap-1 text-[10px] text-muted hover:text-fg"
            onClick={() => setShowSources((v) => !v)}
          >
            {msg.sources.length} fuente{msg.sources.length > 1 ? 's' : ''}
            <ChevronDown size={11} className={`transition-transform ${showSources ? 'rotate-180' : ''}`} />
          </button>
          {showSources && (
            <div className="mt-1 w-full rounded-lg border border-line bg-panel p-1.5">
              {msg.sources.map((s) => (
                <div key={`${s.title}-${s.relevance}`} className="px-1 py-1 text-[10px]">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium text-accent">{s.title}</span>
                    <span className="flex-none text-muted">{s.relevance}%</span>
                  </div>
                  <p className="text-muted">{s.snippet}</p>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}