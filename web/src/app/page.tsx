'use client';

import { useRef, useState } from 'react';
import { AnswerPanel, emptyAnswer, type AnswerState } from '@/components/AnswerPanel';
import { streamAsk } from '@/lib/api';

/**
 * 線上只部署 Python 版，因此介面上不再並排兩個後端。
 * NestJS 版的實作仍保留在 repo 的 api/ 目錄，可於本機啟動對照。
 */
const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:8000';

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
      <div className="flex-1 space-y-3 overflow-y-auto pr-1">
        {state.elapsedMs !== null && state.status === 'idle' && (
          <p className="text-right text-xs text-slate-400">
            {(state.elapsedMs / 1000).toFixed(1)} 秒
          </p>
        )}
        <AnswerPanel state={state} apiBase={API_BASE} />
      </div>

      <div className="flex gap-2 bg-slate-50 pt-4">
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
            同時送出
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
