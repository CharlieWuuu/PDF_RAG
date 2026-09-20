/**
 * Embedding 介面。
 * 之後要換 Gemini 或 Azure OpenAI，只需新增一個實作並在 module 換綁定，
 * 呼叫端（匯入與查詢）完全不必改動。
 */
export interface EmbeddingProvider {
  /** 回傳向量陣列，順序與輸入對應 */
  embed(texts: string[]): Promise<number[][]>;
  readonly dimensions: number;
}

export const EMBEDDING_PROVIDER = Symbol('EMBEDDING_PROVIDER');
