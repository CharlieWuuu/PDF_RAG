import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DbService } from '../db/db.service.js';
import { config } from '../config/app.config.js';
import { extractPages } from '../pdf/pdf-extract.js';
import { removeHeadersFooters } from '../pdf/header-footer.js';
import { chunkPages } from '../chunking/chunker.js';
import { EMBEDDING_PROVIDER, type EmbeddingProvider } from '../providers/embedding.provider.js';

export interface DocumentRow {
  id: string;
  filename: string;
  created_at: Date;
  chunk_count: number;
}

@Injectable()
export class DocumentsService {
  constructor(
    // 明確標註注入目標：tsx／esbuild 不支援 emitDecoratorMetadata，
    // 無法從型別推導相依，因此所有注入一律寫出 @Inject()
    @Inject(DbService) private readonly db: DbService,
    @Inject(EMBEDDING_PROVIDER) private readonly embedding: EmbeddingProvider,
  ) {}

  async ingest(filename: string, buffer: Buffer): Promise<{ id: string; chunks: number }> {
    const raw = await extractPages(new Uint8Array(buffer));
    const { pages } = removeHeadersFooters(raw);
    const chunks = chunkPages(pages, config.chunking);

    if (chunks.length === 0) {
      // 多半是掃描版 PDF（整份都是圖片），及早回報比存進空文件好
      throw new NotFoundException('這份 PDF 擷取不到文字，可能是掃描版；本系統不支援 OCR。');
    }

    // embedding 在交易之外先算完：外部 API 可能很慢，
    // 不應該讓資料庫交易與連線被長時間佔住
    const vectors = await this.embedding.embed(chunks.map((c) => c.content));

    return this.db.withTransaction(async (client) => {
      const inserted = await client.query<{ id: string }>(
        'INSERT INTO documents (filename) VALUES ($1) RETURNING id',
        [filename],
      );
      const documentId = inserted.rows[0].id;

      for (const [i, chunk] of chunks.entries()) {
        await client.query(
          `INSERT INTO chunks (document_id, page, chunk_index, content, embedding)
           VALUES ($1, $2, $3, $4, $5)`,
          // pgvector 接受 '[1,2,3]' 字串格式；仍是參數化，不是字串拼接 SQL
          [documentId, chunk.page, chunk.chunkIndex, chunk.content, `[${vectors[i].join(',')}]`],
        );
      }

      return { id: documentId, chunks: chunks.length };
    });
  }

  async list(): Promise<DocumentRow[]> {
    return this.db.query<DocumentRow>(
      `SELECT d.id, d.filename, d.created_at, COUNT(c.id)::int AS chunk_count
       FROM documents d
       LEFT JOIN chunks c ON c.document_id = d.id
       GROUP BY d.id
       ORDER BY d.created_at DESC`,
    );
  }

  /** 供資料庫檢視頁使用：列出某份文件的所有片段 */
  async listChunks(documentId: string) {
    return this.db.query(
      `SELECT id, page, chunk_index, content, vector_dims(embedding) AS dimensions
       FROM chunks WHERE document_id = $1 ORDER BY chunk_index`,
      [documentId],
    );
  }

  /**
   * 回傳頁面截圖。
   * 本版匯入時不產生截圖（pdfjs 在 Node 渲染教科書過慢，見 README），
   * 但若該文件由 Python 版匯入，這裡仍讀得到——兩版共用同一個資料庫。
   */
  async getPageImage(documentId: string, page: number): Promise<Buffer | null> {
    const rows = await this.db.query<{ image: Buffer }>(
      'SELECT image FROM page_images WHERE document_id = $1 AND page = $2',
      [documentId, page],
    );
    return rows[0]?.image ?? null;
  }

  async remove(id: string): Promise<void> {
    // chunks 設了 ON DELETE CASCADE，刪文件即可連帶清除
    const rows = await this.db.query('DELETE FROM documents WHERE id = $1 RETURNING id', [id]);
    if (rows.length === 0) throw new NotFoundException('找不到這份文件');
  }
}
