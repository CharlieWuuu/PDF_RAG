"""文件匯入、列表、刪除。對應 NestJS 版的 documents.service.ts。"""

from typing import Any

from app import db
from app.chunking.chunker import chunk_pages
from app.config import get_settings
from app.pdf.extract import extract_pages
from app.pdf.header_footer import remove_headers_footers
from app.providers.base import EmbeddingProvider


class NoTextError(Exception):
    """PDF 擷取不到文字，多半是掃描版。"""


class DocumentNotFoundError(Exception):
    pass


def _to_vector_literal(vector: list[float]) -> str:
    """pgvector 接受 '[1,2,3]' 字串格式；仍以參數傳入，不是字串拼接 SQL。"""
    return "[" + ",".join(str(v) for v in vector) + "]"


async def ingest(filename: str, data: bytes, embedding: EmbeddingProvider) -> dict[str, Any]:
    settings = get_settings()

    raw_pages = extract_pages(data)
    pages, _ = remove_headers_footers(raw_pages)
    chunks = chunk_pages(pages, settings.chunk_size, settings.chunk_overlap)

    if not chunks:
        # 多半是掃描版 PDF（整份都是圖片），及早回報比存進空文件好
        raise NoTextError("這份 PDF 擷取不到文字，可能是掃描版；本系統不支援 OCR。")

    # embedding 在交易之外先算完：外部 API 可能很慢，
    # 不應該讓資料庫交易與連線被長時間佔住
    vectors = await embedding.embed([c.content for c in chunks])

    async with db.transaction() as conn:
        cursor = await conn.execute(
            "INSERT INTO documents (filename) VALUES (%s) RETURNING id", (filename,)
        )
        row = await cursor.fetchone()
        document_id = row["id"]  # type: ignore[index]

        for chunk, vector in zip(chunks, vectors, strict=True):
            await conn.execute(
                """INSERT INTO chunks (document_id, page, chunk_index, content, embedding)
                   VALUES (%s, %s, %s, %s, %s)""",
                (
                    document_id,
                    chunk.page,
                    chunk.chunk_index,
                    chunk.content,
                    _to_vector_literal(vector),
                ),
            )

    return {"id": str(document_id), "chunks": len(chunks)}


async def list_documents() -> list[dict[str, Any]]:
    return await db.query(
        """SELECT d.id, d.filename, d.created_at, COUNT(c.id)::int AS chunk_count
           FROM documents d
           LEFT JOIN chunks c ON c.document_id = d.id
           GROUP BY d.id
           ORDER BY d.created_at DESC"""
    )


async def remove(document_id: str) -> None:
    # chunks 設了 ON DELETE CASCADE，刪文件即可連帶清除
    rows = await db.query("DELETE FROM documents WHERE id = %s RETURNING id", (document_id,))
    if not rows:
        raise DocumentNotFoundError("找不到這份文件")
