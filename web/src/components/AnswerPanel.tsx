'use client';

import ReactMarkdown from 'react-markdown';
import type { Source } from '@/lib/api';

export interface AnswerState {
  answer: string;
  sources: Source[];
  status: 'idle' | 'searching' | 'streaming';
  error: string;
  /** 從送出到串流結束的毫秒數，用來比較兩版的反應速度 */
  elapsedMs: number | null;
}

export const emptyAnswer: AnswerState = {
  answer: '',
  sources: [],
  status: 'idle',
  error: '',
  elapsedMs: null,
};

/** 兩版共用的回答區塊，確保呈現方式一致，比較才有意義 */
export function AnswerPanel({ state }: { state: AnswerState }) {
  return (
    <div className="space-y-3">
      {state.status === 'searching' && <p className="text-sm text-slate-500">搜尋中…</p>}
      {state.status === 'streaming' && !state.answer && (
        <p className="text-sm text-slate-500">生成中…</p>
      )}
      {state.error && (
        <p className="rounded bg-red-50 p-3 text-sm text-red-700">{state.error}</p>
      )}

      {state.answer && (
        <div className="rounded-lg border bg-white p-4 text-sm leading-relaxed">
          <ReactMarkdown
            components={{
              strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
              ol: ({ children }) => <ol className="list-decimal space-y-2 pl-5">{children}</ol>,
              ul: ({ children }) => <ul className="list-disc space-y-2 pl-5">{children}</ul>,
              li: ({ children }) => <li className="pl-1">{children}</li>,
              code: ({ children }) => (
                <code className="rounded bg-slate-100 px-1 py-0.5">{children}</code>
              ),
            }}
          >
            {state.answer}
          </ReactMarkdown>
        </div>
      )}

      {state.sources.length > 0 && (
        <div className="space-y-1">
          <h3 className="text-xs font-medium text-slate-500">參考來源</h3>
          {state.sources.map((s, i) => (
            <details key={i} className="rounded border bg-white p-2 text-xs">
              <summary className="cursor-pointer">
                第 {s.page} 頁
                <span className="ml-2 text-slate-400">距離 {s.distance.toFixed(3)}</span>
              </summary>
              <p className="mt-2 whitespace-pre-wrap text-slate-600">{s.content}</p>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
