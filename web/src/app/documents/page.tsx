'use client';

import { useEffect, useState } from 'react';
import {
  deleteDocument,
  listDocuments,
  uploadDocument,
  type DocumentItem,
} from '@/lib/api';

export default function DocumentsPage() {
  const [docs, setDocs] = useState<DocumentItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const refresh = () => listDocuments().then(setDocs).catch((e) => setError(e.message));
  useEffect(() => {
    refresh();
  }, []);

  async function handleUpload(file: File) {
    setUploading(true);
    setError('');
    try {
      await uploadDocument(file);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : '上傳失敗');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">文件管理</h1>

      <label className="block cursor-pointer rounded-lg border-2 border-dashed border-slate-300 bg-white p-8 text-center hover:border-slate-400">
        <input
          type="file"
          accept="application/pdf"
          className="hidden"
          disabled={uploading}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleUpload(file);
            // 清空以便同一個檔案可以重複選取
            e.target.value = '';
          }}
        />
        <span className="text-sm text-slate-600">
          {uploading ? '處理中…（擷取文字、切塊、建立向量）' : '點此選擇 PDF 上傳'}
        </span>
      </label>

      {error && <p className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <ul className="divide-y rounded-lg border bg-white">
        {docs.length === 0 && (
          <li className="p-4 text-sm text-slate-500">尚未匯入任何文件。</li>
        )}
        {docs.map((doc) => (
          <li key={doc.id} className="flex items-center justify-between p-4">
            <div>
              <p className="font-medium">{doc.filename}</p>
              <p className="text-xs text-slate-500">
                {doc.chunk_count} 個片段 · {new Date(doc.created_at).toLocaleString('zh-TW')}
              </p>
            </div>
            <button
              className="text-sm text-red-600 hover:underline"
              onClick={async () => {
                await deleteDocument(doc.id);
                refresh();
              }}
            >
              刪除
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
