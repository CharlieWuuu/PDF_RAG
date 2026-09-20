-- pgvector 擴充必須先啟用，vector 型別才存在
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS documents (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filename   text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chunks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- CASCADE：刪除文件時自動清掉所有 chunk，DELETE API 只需一句 SQL
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  page        int  NOT NULL,
  chunk_index int  NOT NULL,
  content     text NOT NULL,
  -- 維度須與 EMBEDDING_DIMENSIONS 一致；SQL 不吃變數，改模型時這裡要一起改
  embedding   vector(1536) NOT NULL
);

-- 依文件查 chunk（刪除與列表用）；向量索引待資料量成長後再評估 HNSW
CREATE INDEX IF NOT EXISTS chunks_document_id_idx ON chunks (document_id);
