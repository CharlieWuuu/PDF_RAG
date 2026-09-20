import { Inject, Injectable } from '@nestjs/common';
import { DbService } from '../db/db.service.js';
import { config } from '../config/app.config.js';
import { EMBEDDING_PROVIDER, type EmbeddingProvider } from '../providers/embedding.provider.js';
import { LLM_PROVIDER, type LlmProvider } from '../providers/llm.provider.js';
import { buildPrompt, isRelevant, NO_ANSWER, type Source } from './retrieval.js';

export { isRelevant, buildPrompt, NO_ANSWER, type Source } from './retrieval.js';

@Injectable()
export class AskService {
  constructor(
    private readonly db: DbService,
    @Inject(EMBEDDING_PROVIDER) private readonly embedding: EmbeddingProvider,
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
  ) {}

  async retrieve(question: string): Promise<Source[]> {
    const [vector] = await this.embedding.embed([question]);

    // <=> 是 pgvector 的 cosine distance 運算子。
    // 選 cosine 而非 L2：embedding 比較的是語意方向，向量長度不具意義。
    return this.db.query<Source>(
      `SELECT d.filename, c.page, c.content, c.embedding <=> $1 AS distance
       FROM chunks c
       JOIN documents d ON d.id = c.document_id
       ORDER BY c.embedding <=> $1
       LIMIT $2`,
      [`[${vector.join(',')}]`, config.retrieval.topK],
    );
  }

  /**
   * 回傳答案的串流。
   * 找不到相關內容時直接回固定訊息，不呼叫 LLM——
   * 既省成本，也避免模型在沒有依據的情況下編造答案。
   */
  async *answer(
    question: string,
    signal?: AbortSignal,
  ): AsyncIterable<{ type: 'sources'; sources: Source[] } | { type: 'text'; text: string }> {
    const sources = await this.retrieve(question);

    if (!isRelevant(sources, config.retrieval.threshold)) {
      yield { type: 'sources', sources: [] };
      yield { type: 'text', text: NO_ANSWER };
      return;
    }

    // 先送出來源，前端可在文字還沒生成前就顯示出處
    yield { type: 'sources', sources };

    for await (const text of this.llm.stream(buildPrompt(question, sources), signal)) {
      yield { type: 'text', text };
    }
  }
}
