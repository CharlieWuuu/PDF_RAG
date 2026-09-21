'use client';

import { useRef, useState } from 'react';
import { AnswerPanel, emptyAnswer, type AnswerState } from '@/components/AnswerPanel';
import { API_BASE, streamAsk } from '@/lib/api';



export default function ComparePage() {
  const [question, setQuestion] = useState('');
  const [state, setState] = useState<AnswerState>(emptyAnswer);
  const abortRef = useRef<AbortController | null>(null);

  const busy = state.status !== 'idle';

  function patch(next: Partial<AnswerState>) {
    setState((prev) => ({ ...prev, ...next }));
  }

  async function handleAsk() {
    if (!question.trim() || busy) return;

    const controller = new AbortController();
    abortRef.current = controller;
    const startedAt = performance.now();
    setState({ ...emptyAnswer, status: 'searching' });

    try {
      for await (const event of streamAsk(question, controller.signal, API_BASE)) {
        if (event.type === 'sources') {
          patch({ sources: event.sources, status: 'streaming' });
        } else if (event.type === 'text') {
          setState((prev) => ({ ...prev, answer: prev.answer + event.text }));
        } else if (event.type === 'error') {
          patch({ error: event.message });
        }
      }
    } catch (err) {
      // 使用者主動按停止時會丟 AbortError，不算錯誤
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        patch({ error: err instanceof Error ? err.message : '查詢失敗' });
      }
    } finally {
      patch({ status: 'idle', elapsedMs: Math.round(performance.now() - startedAt) });
      abortRef.current = null;
    }
  }

  return (
    <div className="flex h-[calc(100vh-8.5rem)] flex-col gap-4">
      <div className="flex-1 space-y-3 overflow-y-auto">
        {state.elapsedMs !== null && state.status === 'idle' && (
          <p className="text-right text-xs text-slate-400">
            {(state.elapsedMs / 1000).toFixed(1)} 秒
          </p>
        )}
        <AnswerPanel state={state} apiBase={API_BASE} />
      </div>

      <div className="flex gap-2">
        <input
          className="flex-1 rounded-lg border px-4 py-2"
          placeholder="請輸入問題…"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleAsk();
          }}
        />
        {!busy ? (
          <button
            className="rounded-lg bg-slate-900 px-5 py-2 text-white disabled:opacity-40"
            disabled={!question.trim()}
            onClick={handleAsk}
          >
            送出
          </button>
        ) : (
          <button
            className="rounded-lg border border-slate-300 bg-white px-5 py-2"
            onClick={() => abortRef.current?.abort()}
          >
            停止
          </button>
        )}
      </div>
    </div>
  );
}
