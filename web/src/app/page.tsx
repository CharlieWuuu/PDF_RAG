'use client';

import { useRef, useState } from 'react';
import { AnswerPanel, emptyAnswer, type AnswerState } from '@/components/AnswerPanel';
import { streamAsk } from '@/lib/api';

/**
 * 兩個後端並排對照。
 * 明確寫死兩個位址而非讀環境變數，因為這個頁面的目的就是同時比較兩者；
 * 其餘頁面仍沿用 NEXT_PUBLIC_API_BASE。
 */
const BACKENDS = [
  { key: 'node', label: 'NestJS', base: 'http://localhost:3001', accent: 'bg-emerald-600' },
  { key: 'python', label: 'Python', base: 'http://localhost:8000', accent: 'bg-sky-600' },
] as const;

export default function ComparePage() {
  const [question, setQuestion] = useState('');
  const [states, setStates] = useState<Record<string, AnswerState>>({
    node: emptyAnswer,
    python: emptyAnswer,
  });
  const abortRef = useRef<AbortController | null>(null);

  const busy = Object.values(states).some((s) => s.status !== 'idle');

  function patch(key: string, next: Partial<AnswerState>) {
    setStates((prev) => ({ ...prev, [key]: { ...prev[key], ...next } }));
  }

  async function runOne(key: string, base: string, signal: AbortSignal) {
    const startedAt = performance.now();
    patch(key, { ...emptyAnswer, status: 'searching' });

    try {
      for await (const event of streamAsk(question, signal, base)) {
        if (event.type === 'sources') {
          patch(key, { sources: event.sources, status: 'streaming' });
        } else if (event.type === 'text') {
          setStates((prev) => ({
            ...prev,
            [key]: { ...prev[key], answer: prev[key].answer + event.text },
          }));
        } else if (event.type === 'error') {
          patch(key, { error: event.message });
        }
      }
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        patch(key, { error: err instanceof Error ? err.message : '查詢失敗' });
      }
    } finally {
      patch(key, { status: 'idle', elapsedMs: Math.round(performance.now() - startedAt) });
    }
  }

  async function handleAsk() {
    if (!question.trim() || busy) return;

    const controller = new AbortController();
    abortRef.current = controller;

    // 兩邊同時發出，才能公平比較反應速度
    await Promise.all(BACKENDS.map((b) => runOne(b.key, b.base, controller.signal)));
    abortRef.current = null;
  }

  return (
    <div className="flex h-[calc(100vh-8.5rem)] flex-col gap-4">
      <div className="grid flex-1 grid-cols-1 gap-4 overflow-y-auto md:grid-cols-2">
        {BACKENDS.map((b) => {
          const state = states[b.key];
          return (
            <section key={b.key} className="space-y-3">
              <header className="flex items-center gap-2 pb-2">
                <span className={`rounded px-2 py-0.5 text-xs text-white ${b.accent}`}>
                  {b.label}
                </span>
                <span className="text-xs text-slate-400">{b.base.replace('http://', '')}</span>
                {state.elapsedMs !== null && state.status === 'idle' && (
                  <span className="ml-auto text-xs text-slate-500">
                    {(state.elapsedMs / 1000).toFixed(1)} 秒
                  </span>
                )}
              </header>
              <AnswerPanel state={state} apiBase={b.base} />
            </section>
          );
        })}
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
