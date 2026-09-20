# PDF_RAG

匯入 PDF 後，以 RAG（檢索增強生成）方式問答，回答會標註來源檔名與頁碼。

## 架構

```
┌──────────────┐   HTTP / SSE    ┌──────────────┐
│  Next.js     │ ──────────────> │  NestJS      │
│  App Router  │ <────────────── │  API         │
└──────────────┘                 └──────┬───────┘
                                        │
                        ┌───────────────┼───────────────┐
                        ▼               ▼               ▼
                 ┌────────────┐  ┌────────────┐  ┌────────────┐
                 │  OpenAI    │  │  OpenAI    │  │ PostgreSQL │
                 │ embedding  │  │  回答生成   │  │ + pgvector │
                 └────────────┘  └────────────┘  └────────────┘
```

資料流分兩條：

**匯入**　PDF → 逐頁擷取文字 → 移除頁首頁尾 → 切塊 → 批次 embedding → 單一交易寫入 `documents` 與 `chunks`

**查詢**　問題 → embedding → pgvector cosine 取 top-k → 相似度門檻判斷 → 組 prompt → LLM 以 SSE 串流回答

## 技術選擇

| 項目 | 選擇 | 理由 |
| --- | --- | --- |
| 前端 | Next.js App Router、TypeScript、Tailwind | |
| 後端 | NestJS，Controller / Service 分層 | |
| 資料庫 | PostgreSQL + pgvector，用 `pg` 寫參數化 SQL | 不用 ORM，SQL 一目了然，向量查詢也不必繞過 ORM 抽象 |
| Embedding | OpenAI `text-embedding-3-small`（1536 維） | |
| 回答生成 | OpenAI `gpt-4o-mini` | 與 embedding 同一家，只需一把金鑰；已抽成介面，要換 Claude 或 Gemini 只改一行綁定 |

### 為什麼選 pgvector

資料量不大，但同時需要「向量相似度」與「一般關聯查詢」（依文件列出片段、刪除文件連帶清除片段）。

- 若用專用向量資料庫（Pinecone、Qdrant），會多出一套要維運的服務，而且中繼資料與向量分散兩處，刪除文件時得自己確保兩邊一致。
- pgvector 讓向量只是 PostgreSQL 的一個欄位型別，`JOIN` 與外鍵照常使用，`ON DELETE CASCADE` 就能保證一致性，交易也涵蓋向量寫入。
- 正式環境換成 Neon 只需改 `DATABASE_URL`，程式碼不動。

代價是資料量成長到百萬級片段時，效能不如專用向量資料庫。以本專案規模，維運單純的好處大於效能差異。

### 為什麼向量索引先不建

pgvector 的 HNSW 是**近似**最近鄰索引，會犧牲少量準確度換取速度。資料量小時全表掃描只需數毫秒，此時建索引等於白白損失準確度。等片段數成長到數萬筆、查詢明顯變慢，再評估 HNSW 即可。

## 參數取捨

### 切塊：600 字元、重疊 100 字元

- **以字元而非 token 計算**：省去 tokenizer 相依套件，而且對中文更直觀。中文 600 字元約等於 400–500 token。
- **切太小**：單塊語意不完整，檢索到了也不足以回答。
- **切太大**：一塊混入多個主題，embedding 的語意被稀釋，相似度下降；且塞進 prompt 的無關內容變多。
- **重疊 100 字元**：避免答案剛好被切在邊界，導致兩塊都只答一半。重疊越大越安全，但儲存與 embedding 成本同步上升。
- **以段落為單位累積**：段落是語意的自然邊界，沿著段落切比固定長度硬切更能保持語意完整。

參數放在 `CHUNK_SIZE`、`CHUNK_OVERLAP`，可依文件類型調整。

### top-k = 5

- **太小**：答案所需的資訊可能不在檢索結果裡。
- **太大**：無關片段進入 prompt，既增加成本，也可能干擾模型判斷。

5 是常見的起點，以本專案的切塊大小約等於 3000 字元的脈絡。參數為 `TOP_K`。

### 相似度門檻 = 0.55（cosine distance）

pgvector 的 `<=>` 回傳 cosine distance，0 表示完全相同。**最佳結果的 distance 未小於門檻，就直接回覆「資料中找不到相關內容」，不呼叫 LLM。**

- 這麼做既省成本，更重要的是避免模型在沒有依據的情況下編造答案。
- 只看最佳結果：若連最相近的片段都不夠相關，其餘更不可能相關。
- **門檻太嚴**：明明有答案卻被擋掉。**門檻太鬆**：不相關的問題也硬答。

`0.55` 是保守的起點，**務必用自己的文件校準**：問答頁的每個來源都會顯示實際距離，可據此調整 `SIMILARITY_THRESHOLD`。

## 已知限制

- **不支援掃描版 PDF**：純圖片的 PDF 擷取不到文字，系統會在上傳時直接回報錯誤，不做 OCR。
- **表格可能錯亂**：表格在 PDF 中只是帶座標的文字碎片，依座標串成行之後，欄位關係會遺失。
- **雙欄排版可能交錯**：目前依 y 座標分行、x 座標排序，雙欄版面的左右兩欄會被併成同一行。若要支援，需要先做欄位偵測再分區塊處理。
- **每次查詢彼此獨立**：沒有對話歷史，追問時需要把脈絡寫進問題裡。
- **上傳大小上限 20MB**，且檔案在記憶體中處理。

## 開發環境設定

```bash
# 1. 設定環境變數
cp .env.example .env    # 填入 OPENAI_API_KEY

# 2. 啟動資料庫（容器首次啟動會自動執行 db/init.sql 建表）
docker compose up -d

# 3. 後端
cd api && npm install && npm run dev      # http://localhost:3001

# 4. 前端
cd web && npm install && npm run dev      # http://localhost:3000
```

### 階段 1 的檢查工具

在投入 embedding 成本之前，先用肉眼確認擷取品質：

```bash
cd api
npm run inspect -- ./sample.pdf          # 逐頁印出文字
npm run inspect -- ./sample.pdf 10 20    # 只看第 10 到 20 頁
```

會一併列出偵測到的頁首／頁尾樣板（`#` 代表數字），方便確認是否誤刪正文。

### 測試

```bash
cd api && npm test
```

涵蓋切塊邏輯與門檻判斷。這兩者都是純函式，不需要資料庫或 API 金鑰，CI 才能直接跑。

## API

| 方法 | 路徑 | 說明 |
| --- | --- | --- |
| `POST` | `/documents` | 上傳 PDF（multipart，欄位名 `file`） |
| `GET` | `/documents` | 列出文件與各自的片段數 |
| `DELETE` | `/documents/:id` | 刪除文件，連帶清除所有片段 |
| `POST` | `/ask` | 提問，以 SSE 串流回答 |

`POST /ask` 的事件型別：`sources`（來源清單，先送出）、`text`（逐字內容）、`done`、`error`。

用 POST 而非 GET 是因為問題可能很長，放在 body 比塞進 query string 合適；代價是前端不能用 `EventSource`，改以 `fetch` 讀 `ReadableStream`。

## 資料表

```sql
documents(id uuid, filename text, created_at timestamptz)
chunks(id uuid, document_id uuid, page int, chunk_index int, content text, embedding vector(1536))
```

`chunks.document_id` 設 `ON DELETE CASCADE`，刪除文件時自動清除片段。距離運算使用 cosine（`<=>`），因為 embedding 比較的是語意方向，向量長度不具意義。

## 設計上的幾個決定

- **Embedding 與 LLM 各包成一個介面**（`EmbeddingProvider`、`LlmProvider`），要換 Gemini 或 Azure OpenAI 只需新增實作並改 module 的綁定，呼叫端不動。`providers/` 下同時保留 `OpenAiLlmProvider` 與 `ClaudeLlmProvider` 兩個實作，就是這個設計的實證——切換只是改 `ask.module.ts` 的一行。
- **Embedding 在資料庫交易之外先算完**：外部 API 可能很慢，不應該讓交易與連線被長時間佔住。
- **文件與所有片段寫在同一個交易**：任何一步失敗就整批 rollback，避免留下查不到內容的空文件。
- **`DbService` 只提供參數化查詢介面**，不提供任何字串拼接 SQL 的方法，從根本杜絕 SQL injection。
- **檢索的純函式獨立在 `retrieval.ts`**：若與 service 放在一起，單元測試會被迫載入整份設定並要求 API 金鑰。
