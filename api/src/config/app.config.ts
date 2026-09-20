/**
 * 所有環境變數集中在這裡讀取與驗證。
 * 為什麼：散落各處的 process.env 很難知道部署需要哪些設定，
 * 集中之後缺漏會在啟動時就爆，而不是等到使用者送出請求才失敗。
 */
function required(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`缺少必要的環境變數：${key}`);
  return value;
}

function num(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (Number.isNaN(parsed)) throw new Error(`環境變數 ${key} 必須是數字，收到：${raw}`);
  return parsed;
}

export const config = {
  port: num('PORT', 3001),
  databaseUrl: required('DATABASE_URL'),

  embedding: {
    apiKey: required('OPENAI_API_KEY'),
    model: process.env.EMBEDDING_MODEL ?? 'text-embedding-3-small',
    dimensions: num('EMBEDDING_DIMENSIONS', 1536),
  },

  llm: {
    apiKey: required('ANTHROPIC_API_KEY'),
    model: process.env.LLM_MODEL ?? 'claude-sonnet-5',
  },

  chunking: {
    size: num('CHUNK_SIZE', 600),
    overlap: num('CHUNK_OVERLAP', 100),
  },

  retrieval: {
    topK: num('TOP_K', 5),
    /** cosine distance；越小越相似。超過此值視為找不到相關內容 */
    threshold: num('SIMILARITY_THRESHOLD', 0.55),
  },
} as const;
