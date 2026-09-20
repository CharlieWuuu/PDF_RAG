import OpenAI from 'openai';
import { config } from '../config/app.config.js';
import type { EmbeddingProvider } from './embedding.provider.js';

/** 每批送出的文字數上限。分批是為了避免單次請求過大被 API 拒絕 */
const BATCH_SIZE = 64;

export class OpenAiEmbeddingProvider implements EmbeddingProvider {
  readonly dimensions = config.embedding.dimensions;
  private readonly client = new OpenAI({ apiKey: config.embedding.apiKey });

  async embed(texts: string[]): Promise<number[][]> {
    const result: number[][] = [];

    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE);
      const res = await this.client.embeddings.create({
        model: config.embedding.model,
        input: batch,
        dimensions: this.dimensions,
      });
      // API 保證回傳順序與輸入一致，但仍依 index 排序以防萬一
      result.push(...res.data.sort((a, b) => a.index - b.index).map((d) => d.embedding));
    }

    return result;
  }
}
