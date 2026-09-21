"""FastAPI 進入點。對應 NestJS 版的 main.ts。"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import db
from app.config import get_settings
from app.routers import ask, documents


@asynccontextmanager
async def lifespan(_: FastAPI):
    # 連線池隨應用生命週期開關，避免每次請求重新建線
    await db.open_pool()
    yield
    await db.close_pool()


app = FastAPI(title="PDF RAG API（Python 版）", lifespan=lifespan)

# 前端與 API 不同網域，需要 CORS。
# 來源改由環境變數指定，正式環境才不會對所有網站開放
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in get_settings().cors_origins.split(",") if o.strip()],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health():
    """部署平台的健康檢查端點。只確認應用存活，不碰資料庫——
    資料庫短暫不可用時不該讓整個服務被重啟。"""
    return {"status": "ok"}


app.include_router(documents.router)
app.include_router(ask.router)
