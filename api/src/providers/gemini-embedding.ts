import { GoogleGenAI } from '@google/genai';
import { config } from '../config/app.config.js';
import type { EmbeddingProvider } from './embedding.provider.js';

/** 每批送出的文字數上限，避免單次請求過大被 API 拒絕 */
const BATCH_SIZE = 32;
/** 免費額度有每分鐘請求數限制，撞到時退避重試 */
const MAX_RETRIES = 4;

export class GeminiEmbeddingProvider implements EmbeddingProvider {
  readonly dimensions = config.embedding.dimensions;
  private readonly client = new GoogleGenAI({ apiKey: config.embedding.apiKey });

  async embed(texts: string[]): Promise<number[][]> {
    const result: number[][] = [];

    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE);
      const res = await this.withRetry(() =>
        this.client.models.embedContent({
          model: config.embedding.model,
          contents: batch,
          config: {
            // Gemini 預設 3072 維，這裡指定 1536 以沿用既有的 vector(1536) 欄位。
            // 這正是把維度放進環境變數的用意：換供應商不必改 DDL
            outputDimensionality: this.dimensions,
          },
        }),
      );

      const vectors = res.embeddings?.map((e) => e.values ?? []) ?? [];
      if (vectors.length !== batch.length) {
        throw new Error(`Gemini 回傳的向量數量不符：預期 ${batch.length}，實得 ${vectors.length}`);
      }
      result.push(...vectors);
    }

    return result;
  }

  /**
   * 免費額度的每分鐘請求數限制很容易在匯入大檔時撞到，
   * 用指數退避重試，避免整份文件因為一次 429 就整批失敗。
   */
  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await fn();
      } catch (err) {
        const status = (err as { status?: number })?.status;
        // 只重試流量限制與伺服器端錯誤；金鑰錯誤這類問題重試也沒用
        const retryable = status === 429 || (status !== undefined && status >= 500);
        if (!retryable || attempt >= MAX_RETRIES) throw err;
        await new Promise((r) => setTimeout(r, 2 ** attempt * 1000));
      }
    }
  }
}
