"""
所有環境變數集中在這裡讀取與驗證。對應 NestJS 版的 app.config.ts。

為什麼：散落各處的 os.environ 很難知道部署需要哪些設定，
集中之後缺漏會在啟動時就爆，而不是等到使用者送出請求才失敗。
"""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # 與 NestJS 版共用專案根目錄的同一份 .env，避免兩套設定不同步
    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parent.parent.parent / ".env",
        extra="ignore",
    )

    database_url: str

    gemini_api_key: str
    embedding_model: str = "gemini-embedding-001"
    # Gemini 預設 3072 維，指定 1536 以沿用既有的 vector(1536) 欄位
    embedding_dimensions: int = 1536
    llm_model: str = "gemini-3.5-flash-lite"
    # 讀圖用的模型。與 llm_model 分開設定，
    # 因為視覺任務與純文字生成的需求不同，可各自調整
    vision_model: str = "gemini-3.5-flash-lite"

    # 切塊參數（以字元數計算，對中文較直觀）
    chunk_size: int = 600
    chunk_overlap: int = 100

    top_k: int = 5
    # cosine distance 門檻：最佳結果大於此值視為找不到相關內容，不呼叫 LLM
    similarity_threshold: float = 0.55

    # 避開 NestJS 版佔用的 3001
    python_port: int = 8000


@lru_cache
def get_settings() -> Settings:
    """快取設定，避免每次請求都重新解析 .env。"""
    return Settings()  # type: ignore[call-arg]
