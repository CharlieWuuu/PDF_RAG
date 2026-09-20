'use client';

import { useRef, useState } from 'react';
import { streamAsk, type Source } from '@/lib/api';

/** 檢索與生成是兩個階段，狀態分開才能顯示「搜尋中…」 */
type Status = 'idle' | 'searching' | 'streaming';

export default function AskPage() {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [sources, setSources] = useState<Source[]>([]);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  async function handleAsk() {
    if (!question.trim() || status !== 'idle') return;

    setAnswer('');
    setSources([]);
    setError('');
    setStatus('searching');

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      for await (const event of streamAsk(question, controller.signal)) {
        if (event.type === 'sources') {
          setSources(event.sources);
          // 收到來源代表檢索已完成，接下來是逐字生成
          setStatus('streaming');
        } else if (event.type === 'text') {
          setAnswer((prev) => prev + event.text);
        } else if (event.type === 'error') {
          setError(event.message);
        }
      }
    } catch (e) {
      // 使用者主動按停止時會丟 AbortError，不算錯誤
      if (!(e instanceof DOMException && e.name === 'AbortError')) {
        setError(e instanceof Error ? e.message : '查詢失敗');
      }
    } finally {
      setStatus('idle');
      abortRef.current = null;
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">文件問答</h1>

      <div className="flex gap-2">
        <input
          className="flex-1 rounded-lg border px-4 py-2"
          placeholder="請輸入問題…"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAsk()}
        />
        {status === 'idle' ? (
          <button
            className="rounded-lg bg-slate-900 px-5 py-2 text-white disabled:opacity-40"
            disabled={!question.trim()}
            onClick={handleAsk}
          >
            送出
          </button>
        ) : (
          <button
            className="rounded-lg border border-slate-300 px-5 py-2"
            // 中止 fetch 會關閉連線，後端據此也會中止對 LLM 的請求
            onClick={() => abortRef.current?.abort()}
          >
            停止
          </button>
        )}
      </div>

      {status === 'searching' && <p className="text-sm text-slate-500">搜尋中…</p>}
      {error && <p className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {answer && (
        <div className="rounded-lg border bg-white p-5">
          <p className="whitespace-pre-wrap leading-relaxed">{answer}</p>
        </div>
      )}

      {sources.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-slate-600">參考來源</h2>
          {sources.map((s, i) => (
            <details key={i} className="rounded-lg border bg-white p-3 text-sm">
              <summary className="cursor-pointer">
                {s.filename}　第 {s.page} 頁
                <span className="ml-2 text-xs text-slate-400">
                  距離 {s.distance.toFixed(3)}
                </span>
              </summary>
              <p className="mt-2 whitespace-pre-wrap text-slate-600">{s.content}</p>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
