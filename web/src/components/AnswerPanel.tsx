'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { pageImageUrl, type Source } from '@/lib/api';

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
export function AnswerPanel({ state, apiBase }: { state: AnswerState; apiBase: string }) {
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
            <SourceItem key={i} source={s} apiBase={apiBase} />
          ))}
        </div>
      )}
    </div>
  );
}

function SourceItem({ source, apiBase }: { source: Source; apiBase: string }) {
  const [zoomed, setZoomed] = useState(false);
  const isVisual = source.source === 'visual';
  // 視覺描述由 AI 產生，附上原圖讓使用者能自行核對是否看錯
  const imageUrl =
    source.documentId && pageImageUrl(apiBase, source.documentId, source.page);

  return (
    <details className="rounded border bg-white p-2 text-xs">
      <summary className="cursor-pointer">
        第 {source.page} 頁
        {isVisual && (
          <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-amber-700">圖表</span>
        )}
        <span className="ml-2 text-slate-400">距離 {source.distance.toFixed(3)}</span>
      </summary>

      {imageUrl && (
        <div className="mt-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt={`第 ${source.page} 頁`}
            className="w-32 cursor-zoom-in rounded border"
            onClick={() => setZoomed(true)}
            // 沒有截圖的來源（例如 NestJS 版）直接隱藏，不顯示破圖
            onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
          />
          <p className="mt-1 text-slate-400">點圖放大核對</p>
        </div>
      )}

      <p className="mt-2 whitespace-pre-wrap text-slate-600">{source.content}</p>

      {zoomed && imageUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
          onClick={() => setZoomed(false)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt={`第 ${source.page} 頁`}
            className="max-h-full max-w-full rounded bg-white"
          />
        </div>
      )}
    </details>
  );
}
