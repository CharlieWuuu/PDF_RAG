"""FastAPI 進入點。對應 NestJS 版的 main.ts。"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import db
from app.routers import documents


@asynccontextmanager
async def lifespan(_: FastAPI):
    # 連線池隨應用生命週期開關，避免每次請求重新建線
    await db.open_pool()
    yield
    await db.close_pool()


app = FastAPI(title="PDF RAG API（Python 版）", lifespan=lifespan)

# 前端在另一個 port，開發時需要 CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(documents.router)
