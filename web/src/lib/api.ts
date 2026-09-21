export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:3001';

export interface DocumentItem {
  id: string;
  filename: string;
  created_at: string;
  chunk_count: number;
}

export interface Source {
  filename: string;
  page: number;
  content: string;
  distance: number;
  /** 'text'（課文原文）或 'visual'（視覺模型對圖表的描述） */
  source?: 'text' | 'visual';
  /** 用來取回該頁截圖；NestJS 版未實作截圖時可能為空 */
  documentId?: string;
}

/** 頁面截圖網址。讓使用者能核對 AI 對圖表的描述是否正確 */
export function pageImageUrl(base: string, documentId: string, page: number): string {
  return `${base}/documents/${documentId}/pages/${page}/image`;
}

/** 後端 SSE 的事件型別，與 ask.controller 送出的 JSON 對應 */
export type AskEvent =
  | { type: 'sources'; sources: Source[] }
  | { type: 'text'; text: string }
  | { type: 'done' }
  | { type: 'error'; message: string };

export async function listDocuments(): Promise<DocumentItem[]> {
  const res = await fetch(`${API_BASE}/documents`, { cache: 'no-store' });
  if (!res.ok) throw new Error('取得文件列表失敗');
  return res.json();
}

export async function uploadDocument(file: File) {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_BASE}/documents`, { method: 'POST', body: form });
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.message ?? '上傳失敗');
  return res.json();
}

export interface ChunkRow {
  id: string;
  page: number;
  chunk_index: number;
  content: string;
  dimensions: number;
}

/** 資料庫檢視頁用：看某份文件實際被切成哪些片段 */
export async function listChunks(documentId: string): Promise<ChunkRow[]> {
  const res = await fetch(`${API_BASE}/documents/${documentId}/chunks`, { cache: 'no-store' });
  if (!res.ok) throw new Error('取得片段失敗');
  return res.json();
}

export async function deleteDocument(id: string) {
  const res = await fetch(`${API_BASE}/documents/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('刪除失敗');
}

/**
 * 讀取 SSE 串流。
 * 為什麼不用 EventSource：EventSource 只支援 GET，
 * 而問題放在 POST body 比塞進 query string 合適，所以改用 fetch 讀 ReadableStream。
 */
export async function* streamAsk(
  question: string,
  signal: AbortSignal,
  // 並排對照頁需要同時打兩個後端，因此開放覆寫；
  // 其餘頁面不傳，沿用環境變數的預設值
  base: string = API_BASE,
): AsyncGenerator<AskEvent> {
  const res = await fetch(`${base}/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
    signal,
  });
  if (!res.body) throw new Error('伺服器沒有回傳串流');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE 以空行分隔事件；最後一段可能不完整，留在 buffer 等下一次讀取補齊
    const parts = buffer.split('\n\n');
    buffer = parts.pop() ?? '';

    for (const part of parts) {
      const line = part.split('\n').find((l) => l.startsWith('data: '));
      if (line) yield JSON.parse(line.slice(6)) as AskEvent;
    }
  }
}
