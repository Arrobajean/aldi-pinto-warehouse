'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Bot, ChevronDown, Send, Sparkles, User } from 'lucide-react';
import type { ChatMsg } from '@/hooks/use-assistant';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

interface AssistantViewProps {
  messages: ChatMsg[];
  loading: boolean;
  onSend: (text: string) => void;
}

const SUGGESTIONS = [
  '¿Cómo va el almacén ahora mismo?',
  '¿Qué muelles están ocupados?',
  '¿Dónde está la flejadora FLJ-01?',
  '¿Hay cámaras desatendidas?',
  '¿Cuántos palets caducan pronto?',
];

export function AssistantView({ messages, loading, onSend }: AssistantViewProps) {
  const [text, setText] = useState('');
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    onSend(text);
    setText('');
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <span className="flex size-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <Bot className="size-4.5" />
        </span>
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            Asistente de operaciones
            <Badge variant="secondary" className="font-mono text-[10px]">
              RAG · estado en vivo
            </Badge>
          </h2>
          <p className="text-xs text-muted-foreground">Pregunta por el almacén y su estado en vivo</p>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4">
          {messages.length === 0 && (
            <Card className="gap-3 border-dashed bg-card/50 p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Sparkles className="size-4 text-primary" />
                Empieza con una de estas preguntas
              </div>
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <Button key={s} variant="outline" size="sm" onClick={() => onSend(s)} className="text-xs font-normal">
                    {s}
                  </Button>
                ))}
              </div>
            </Card>
          )}

          {messages.map((m) => (
            <Message key={m.id} msg={m} />
          ))}

          {loading && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="size-1.5 animate-bounce rounded-full bg-primary" />
              <span className="size-1.5 animate-bounce rounded-full bg-primary [animation-delay:150ms]" />
              <span className="size-1.5 animate-bounce rounded-full bg-primary [animation-delay:300ms]" />
              Pensando…
            </div>
          )}
          <div ref={endRef} />
        </div>
      </ScrollArea>

      <div className="border-t bg-background p-4">
        <form onSubmit={submit} className="mx-auto flex w-full max-w-3xl items-center gap-2">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Pregunta por el almacén…"
            aria-label="Pregunta sobre las operaciones"
          />
          <Button type="submit" size="icon" disabled={loading || !text.trim()} aria-label="Enviar pregunta al asistente">
            <Send />
          </Button>
        </form>
      </div>
    </div>
  );
}

function Message({ msg }: { msg: ChatMsg }) {
  const [showSources, setShowSources] = useState(false);
  const isUser = msg.sender === 'user';

  return (
    <div className={cn('flex gap-3', isUser && 'flex-row-reverse')}>
      <Avatar className="size-8 flex-none">
        <AvatarFallback className={cn('text-xs font-bold', isUser ? 'bg-secondary text-foreground' : 'bg-primary/15 text-primary')}>
          {isUser ? <User className="size-4" /> : <Bot className="size-4" />}
        </AvatarFallback>
      </Avatar>

      <div className={cn('flex max-w-[85%] flex-col gap-1.5', isUser && 'items-end')}>
        <Card
          className={cn(
            'gap-0 py-0 text-sm leading-relaxed shadow-none',
            isUser ? 'border-primary/30 bg-primary/10' : 'bg-card',
          )}
        >
          <div className="whitespace-pre-wrap px-3.5 py-2.5">{msg.text}</div>
        </Card>

        {msg.sources && msg.sources.length > 0 && (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 gap-1 px-1.5 text-[10px] text-muted-foreground"
              onClick={() => setShowSources((v) => !v)}
            >
              {msg.sources.length} fuente{msg.sources.length > 1 ? 's' : ''}
              <ChevronDown className={cn('size-3 transition-transform', showSources && 'rotate-180')} />
            </Button>
            {showSources && (
              <div className="w-full rounded-lg border bg-card p-2">
                {msg.sources.map((s) => (
                  <div key={`${s.title}-${s.relevance}`} className="px-1 py-1 text-[11px]">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-medium text-primary">{s.title}</span>
                      <span className="flex-none text-muted-foreground">{s.relevance}%</span>
                    </div>
                    <p className="text-muted-foreground">{s.snippet}</p>
                    <Separator className="mt-1.5 last:hidden" />
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
