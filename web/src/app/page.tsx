'use client';

import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { API_BASE, streamAsk, type Source } from '@/lib/api';

/** 檢索與生成是兩個階段，狀態分開才能顯示「搜尋中…」 */
type Status = 'idle' | 'searching' | 'streaming';

export default function AskPage() {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [sources, setSources] = useState<Source[]>([]);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  // 答案逐字增加時保持捲動在底部，使用者不必手動往下拉
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [answer, sources]);

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
    // 高度固定為視窗扣掉 header，讓對話區自己捲動、輸入框永遠停在底部
    <div className="flex h-[calc(100vh-8.5rem)] flex-col gap-4">
      {/* 對話區在上，內容變長時自行捲動 */}
      <div className="flex-1 space-y-4 overflow-y-auto pr-1">
        {!answer && !error && status === 'idle' && (
          <div className="pt-12 text-center text-sm text-slate-400">
            <p>輸入問題，我會根據已匯入的文件回答並標註出處。</p>
            {/* 兩個後端功能相同，不標示的話無從得知目前連的是哪一個 */}
            <p className="mt-2 text-xs">
              目前連線：{API_BASE.includes('8000') ? 'Python' : 'NestJS'}
              <span className="ml-1 text-slate-300">{API_BASE.replace('http://', '')}</span>
            </p>
          </div>
        )}

        {status === 'searching' && <p className="text-sm text-slate-500">搜尋中…</p>}
        {error && <p className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        {answer && (
          <div className="rounded-lg border bg-white p-5">
            {/*
              模型的回答帶有 Markdown 語法（粗體、編號清單），直接輸出會看到
              原始的 ** 符號。react-markdown 預設不解析 raw HTML，
              因此模型即使吐出 <script> 也只會被當成文字，不必額外消毒。
            */}
            <div className="space-y-3 leading-relaxed">
              <ReactMarkdown
                components={{
                  p: ({ children }) => <p>{children}</p>,
                  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                  ol: ({ children }) => <ol className="list-decimal space-y-2 pl-5">{children}</ol>,
                  ul: ({ children }) => <ul className="list-disc space-y-2 pl-5">{children}</ul>,
                  li: ({ children }) => <li className="pl-1">{children}</li>,
                  code: ({ children }) => (
                    <code className="rounded bg-slate-100 px-1 py-0.5 text-sm">{children}</code>
                  ),
                }}
              >
                {answer}
              </ReactMarkdown>
            </div>
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

        {/* 串流時把畫面捲到底，新內容才不會被輸入框擋住 */}
        <div ref={bottomRef} />
      </div>

      {/* 輸入區固定在下方，不隨對話捲動 */}
      <div className="flex gap-2 bg-slate-50 pt-4">
        <input
          className="flex-1 rounded-lg border px-4 py-2"
          placeholder="請輸入問題…"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          // 中文輸入法選字時也會觸發 Enter，isComposing 用來排除那種情況，
          // 否則選字按 Enter 會誤送出未完成的問題
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleAsk();
          }}
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
            className="rounded-lg border border-slate-300 bg-white px-5 py-2"
            // 中止 fetch 會關閉連線，後端據此也會中止對 LLM 的請求
            onClick={() => abortRef.current?.abort()}
          >
            停止
          </button>
        )}
      </div>
    </div>
  );
}
