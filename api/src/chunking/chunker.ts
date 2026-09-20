import type { PageText } from '../pdf/pdf-extract.js';

export interface Chunk {
  page: number;
  chunkIndex: number;
  content: string;
}

export interface ChunkOptions {
  /** 目標大小，以字元數計。用字元而非 token：省去 tokenizer 相依，且對中文更直觀 */
  size: number;
  /** 前後重疊字元數，避免答案剛好被切在邊界而兩邊都答不全 */
  overlap: number;
}

/**
 * 以段落為單位切塊。
 * 為什麼不用固定長度硬切：段落是語意的自然邊界，
 * 沿著段落累積到接近目標大小才斷開，能讓每塊保持語意完整，embedding 品質較好。
 *
 * 每塊記錄頁碼，來源標註才有依據；跨頁累積時記首段所在頁。
 */
export function chunkPages(pages: PageText[], opts: ChunkOptions): Chunk[] {
  const chunks: Chunk[] = [];
  let buffer = '';
  let bufferPage = 1;
  // 獨立旗標記錄「目前這塊是否還沒放進任何新段落」。
  // 不能用 buffer 是否為空判斷，因為 flush 後 buffer 會保留 overlap 文字，
  // 那樣會使跨頁時頁碼停留在前一頁，導致出處標註錯誤。
  let bufferEmpty = true;

  const flush = () => {
    const content = buffer.trim();
    if (content.length > 0) {
      chunks.push({ page: bufferPage, chunkIndex: chunks.length, content });
    }
    // 保留尾端 overlap 字元作為下一塊開頭，銜接語意
    buffer = opts.overlap > 0 ? buffer.slice(-opts.overlap) : '';
    bufferEmpty = true;
  };

  for (const page of pages) {
    for (const paragraph of page.lines) {
      // 單一段落就超過目標大小時，退回固定長度切分，避免產生過大的塊
      if (paragraph.length > opts.size) {
        if (!bufferEmpty) flush();
        bufferPage = page.page;
        for (let i = 0; i < paragraph.length; i += opts.size - opts.overlap) {
          buffer = paragraph.slice(i, i + opts.size);
          flush();
        }
        buffer = '';
        bufferEmpty = true;
        continue;
      }

      if (buffer.length + paragraph.length > opts.size) flush();
      // 這一塊的第一個段落決定頁碼
      if (bufferEmpty) bufferPage = page.page;
      buffer += (buffer ? '\n' : '') + paragraph;
      bufferEmpty = false;
    }
  }

  if (!bufferEmpty && buffer.trim()) {
    const content = buffer.trim();
    chunks.push({ page: bufferPage, chunkIndex: chunks.length, content });
  }
  return chunks;
}
