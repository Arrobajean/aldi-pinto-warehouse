'use client';

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { localFallback, postChat } from '@/lib/api';
import { buildLiveSnapshot, type ChatSource, type UiAction } from '@/lib/chat';
import type { SimState } from '@/lib/sim/types';
import type { WarehouseScene } from '@/three/warehouse-scene';
import type { ZoneId } from '@/lib/types';

export interface ChatMsg {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  sources?: ChatSource[];
  actions?: UiAction[];
}

type MessageRole = { role: 'user' | 'model'; parts: string };

export function useAssistant(
  getSnapshot: () => SimState | null,
  onAction?: (action: UiAction) => void,
) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const seq = useRef(0);

  const snapshotRef = useRef(getSnapshot);
  const actionRef = useRef(onAction);

  useEffect(() => {
    snapshotRef.current = getSnapshot;
  }, [getSnapshot]);

  useEffect(() => {
    actionRef.current = onAction;
  }, [onAction]);

  const addMsg = useCallback((sender: ChatMsg['sender'], text: string, sources?: ChatSource[], actions?: UiAction[]) => {
    seq.current++;
    setMessages((prev) => [...prev, { id: `m${seq.current}`, sender, text, sources, actions }]);
  }, []);

  const send = useCallback(
    async (text: string) => {
      const t = text.trim();
      if (!t || loading) return;
      addMsg('user', t);
      setLoading(true);
      try {
        const snapshot = snapshotRef.current();
        if (!snapshot) throw new Error('Sin estado de simulación');
        const history: MessageRole[] = messages
          .filter((m) => m.sender !== 'user' || m.actions?.length)
          .slice(-8)
          .map((m) => ({ role: m.sender === 'user' ? 'user' : 'model', parts: m.text }));
        const res = await postChat({ question: t, history, snapshot: buildLiveSnapshot(snapshot) });
        addMsg('assistant', res.answer, res.sources, res.ui_actions);
        for (const action of res.ui_actions) actionRef.current?.(action);
      } catch (err) {
        // Plan B local si no hay conexión o no está configurado.
        console.warn('chat fallback local:', err);
        const fallback = await localFallback(t);
        addMsg('assistant', fallback.answer, fallback.sources);
      } finally {
        setLoading(false);
      }
    },
    [addMsg, loading, messages],
  );

  return { messages, loading, open, setOpen, send };
}

/** Traduce una UiAction en la ejecución que corresponda según la escena. */
export function defaultActions(sceneRef: MutableRefObject<WarehouseScene | null>) {
  return (action: UiAction) => {
    const scene = sceneRef.current;
    if (!scene) return;
    switch (action.type) {
      case 'focus_entity':
        scene.followEntity(action.target);
        scene.setZoomLevel(1);
        break;
      case 'focus_location':
        scene.focusLocation(action.target, true);
        break;
      case 'highlight_zone':
        scene.focusZone(action.target as ZoneId);
        break;
      case 'open_card':
        break;
    }
  };
}