'use client';

import { useEffect, useState } from 'react';
import {
  listChunks,
  listDocuments,
  type ChunkRow,
  type DocumentItem,
} from '@/lib/api';

/**
 * 資料庫檢視頁。
 * 讓切塊結果可以被肉眼檢查——切得太碎、頁碼標錯、
 * 混入頁首頁尾雜訊，這些問題在問答介面上看不出來。
 */
export default function DatabasePage() {
  const [docs, setDocs] = useState<DocumentItem[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [chunks, setChunks] = useState<ChunkRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    listDocuments().then((d) => {
      setDocs(d);
      if (d.length > 0) setSelected(d[0].id);
    });
  }, []);

  useEffect(() => {
    if (!selected) return;
    setLoading(true);
    listChunks(selected)
      .then(setChunks)
      .finally(() => setLoading(false));
  }, [selected]);

  const totalChars = chunks.reduce((sum, c) => sum + c.content.length, 0);
  const pages = new Set(chunks.map((c) => c.page));

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold">資料庫內容</h1>

      {docs.length === 0 ? (
        <p className="text-sm text-slate-500">尚未匯入任何文件。</p>
      ) : (
        <>
          <select
            className="w-full rounded-lg border bg-white px-3 py-2 text-sm"
            value={selected ?? ''}
            onChange={(e) => setSelected(e.target.value)}
          >
            {docs.map((d) => (
              <option key={d.id} value={d.id}>
                {d.filename}（{d.chunk_count} 塊）
              </option>
            ))}
          </select>

          {/* 統計數字能快速看出切塊參數是否合理 */}
          <div className="grid grid-cols-4 gap-3 text-center">
            {[
              ['片段數', chunks.length],
              ['有文字頁數', pages.size],
              ['總字數', totalChars.toLocaleString()],
              [
                '平均每塊',
                chunks.length ? Math.round(totalChars / chunks.length) + ' 字' : '—',
              ],
            ].map(([label, value]) => (
              <div key={label as string} className="rounded-lg border bg-white p-3">
                <p className="text-xs text-slate-500">{label}</p>
                <p className="text-lg font-medium">{value}</p>
              </div>
            ))}
          </div>

          {loading ? (
            <p className="text-sm text-slate-500">載入中…</p>
          ) : (
            <div className="space-y-2">
              {chunks.map((c) => (
                <div key={c.id} className="rounded-lg border bg-white p-3">
                  <div className="mb-2 flex gap-3 text-xs text-slate-500">
                    <span className="rounded bg-slate-100 px-2 py-0.5">#{c.chunk_index}</span>
                    <span>第 {c.page} 頁</span>
                    <span>{c.content.length} 字</span>
                    <span className="ml-auto">向量 {c.dimensions} 維</span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                    {c.content}
                  </p>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
