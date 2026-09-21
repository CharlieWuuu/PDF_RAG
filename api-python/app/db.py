"""資料庫連線與交易封裝。對應 NestJS 版的 db.service.ts。"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from psycopg import AsyncConnection
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

from app.config import get_settings

_pool: AsyncConnectionPool | None = None


async def open_pool() -> None:
    """
    在應用啟動時建立連線池。

    用連線池而非每次新建連線：Neon 這類託管資料庫的建線成本高。
    """
    global _pool
    settings = get_settings()
    _pool = AsyncConnectionPool(
        settings.database_url,
        min_size=1,
        # Neon 免費方案的連線數有限，且本應用為 demo 規模，不需要大量連線
        max_size=5,
        open=False,
        kwargs={"row_factory": dict_row},
    )
    # 不等待連線建立完成：資料庫短暫不可用時，應用仍應正常啟動，
    # 否則部署平台的健康檢查會因啟動逾時而判定失敗。
    # 連線會在首次查詢時建立，失敗則由該次請求回報錯誤
    await _pool.open(wait=False)


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


def _require_pool() -> AsyncConnectionPool:
    if _pool is None:
        raise RuntimeError("連線池尚未建立，請確認應用已正確啟動")
    return _pool


async def query(sql: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
    """
    一律走參數化查詢。

    不提供任何字串拼接 SQL 的介面，從根本上杜絕 SQL injection。
    """
    async with _require_pool().connection() as conn:
        cursor = await conn.execute(sql, params)
        return await cursor.fetchall()


@asynccontextmanager
async def transaction() -> AsyncIterator[AsyncConnection]:
    """
    交易封裝。

    匯入 PDF 時「文件紀錄 + 所有 chunk」必須全有或全無，
    否則失敗會留下沒有內容的空文件，使用者看得到卻查不到東西。

    psycopg 的 conn.transaction() 會在例外時自動 rollback、正常結束時 commit。
    """
    async with _require_pool().connection() as conn, conn.transaction():
        yield conn
