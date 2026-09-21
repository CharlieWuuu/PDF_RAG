"""文件匯入、列表、刪除。對應 NestJS 版的 documents.service.ts。"""

import asyncio
from typing import Any

import pymupdf

from app import db
from app.chunking.chunker import chunk_pages
from app.config import get_settings
from app.pdf.extract import extract_pages
from app.pdf.header_footer import remove_headers_footers
from app.pdf.render import has_images, render_page
from app.providers.base import EmbeddingProvider
from app.providers.vision import GeminiVisionProvider


class NoTextError(Exception):
    """PDF 擷取不到文字，多半是掃描版。"""


class DocumentNotFoundError(Exception):
    pass


def _to_vector_literal(vector: list[float]) -> str:
    """pgvector 接受 '[1,2,3]' 字串格式；仍以參數傳入，不是字串拼接 SQL。"""
    return "[" + ",".join(str(v) for v in vector) + "]"


async def ingest(
    filename: str,
    data: bytes,
    embedding: EmbeddingProvider,
    vision: GeminiVisionProvider | None = None,
) -> dict[str, Any]:
    settings = get_settings()

    raw_pages = extract_pages(data)
    pages, _ = remove_headers_footers(raw_pages)
    text_chunks = chunk_pages(pages, settings.chunk_size, settings.chunk_overlap)

    # 渲染每頁截圖，並對有圖的頁面請視覺模型描述圖表內容
    images, visual_chunks = await _build_visuals(data, vision, start_index=len(text_chunks))

    if not text_chunks and not visual_chunks:
        # 多半是掃描版 PDF（整份都是圖片），及早回報比存進空文件好
        raise NoTextError("這份 PDF 擷取不到文字，可能是掃描版；本系統不支援 OCR。")

    # (page, chunk_index, content, source) 的統一清單，方便一起做 embedding
    rows = [(c.page, c.chunk_index, c.content, "text") for c in text_chunks]
    rows += [(page, index, content, "visual") for page, index, content in visual_chunks]

    # embedding 在交易之外先算完：外部 API 可能很慢，
    # 不應該讓資料庫交易與連線被長時間佔住
    vectors = await embedding.embed([r[2] for r in rows])

    async with db.transaction() as conn:
        cursor = await conn.execute(
            "INSERT INTO documents (filename) VALUES (%s) RETURNING id", (filename,)
        )
        row = await cursor.fetchone()
        document_id = row["id"]  # type: ignore[index]

        for (page, chunk_index, content, source), vector in zip(rows, vectors, strict=True):
            await conn.execute(
                """INSERT INTO chunks
                   (document_id, page, chunk_index, content, source, embedding)
                   VALUES (%s, %s, %s, %s, %s, %s)""",
                (document_id, page, chunk_index, content, source, _to_vector_literal(vector)),
            )

        # 截圖與 chunk 在同一交易內寫入，任一步失敗就整批 rollback
        for page, image in images.items():
            await conn.execute(
                "INSERT INTO page_images (document_id, page, image) VALUES (%s, %s, %s)",
                (document_id, page, image),
            )

    return {
        "id": str(document_id),
        "chunks": len(rows),
        "textChunks": len(text_chunks),
        "visualChunks": len(visual_chunks),
        "pageImages": len(images),
    }


async def _build_visuals(
    data: bytes,
    vision: GeminiVisionProvider | None,
    start_index: int,
) -> tuple[dict[int, bytes], list[tuple[int, int, str]]]:
    """
    回傳 (每頁截圖, 圖表描述 chunk)。

    截圖一律保留，讓使用者能核對 AI 是否看錯圖；
    描述只對有圖片的頁面產生，純文字頁送去只是浪費額度。
    """
    images: dict[int, bytes] = {}
    targets: list[int] = []

    with pymupdf.open(stream=data, filetype="pdf") as doc:
        for page in range(1, len(doc) + 1):
            images[page] = render_page(doc, page)
            if has_images(doc, page):
                targets.append(page)

    if vision is None or not targets:
        return images, []

    described = await asyncio.gather(*(vision.describe(images[p]) for p in targets))

    visual_chunks: list[tuple[int, int, str]] = []
    for page, text in zip(targets, described, strict=True):
        if text:
            visual_chunks.append((page, start_index + len(visual_chunks), text))

    return images, visual_chunks


async def get_page_image(document_id: str, page: int) -> bytes | None:
    rows = await db.query(
        "SELECT image FROM page_images WHERE document_id = %s AND page = %s",
        (document_id, page),
    )
    return bytes(rows[0]["image"]) if rows else None


async def list_documents() -> list[dict[str, Any]]:
    return await db.query(
        """SELECT d.id, d.filename, d.created_at, COUNT(c.id)::int AS chunk_count
           FROM documents d
           LEFT JOIN chunks c ON c.document_id = d.id
           GROUP BY d.id
           ORDER BY d.created_at DESC"""
    )


async def list_chunks(document_id: str) -> list[dict[str, Any]]:
    """供資料庫檢視頁使用：列出某份文件的所有片段。"""
    return await db.query(
        """SELECT id, page, chunk_index, content, source, vector_dims(embedding) AS dimensions
           FROM chunks WHERE document_id = %s ORDER BY chunk_index""",
        (document_id,),
    )


async def remove(document_id: str) -> None:
    # chunks 設了 ON DELETE CASCADE，刪文件即可連帶清除
    rows = await db.query("DELETE FROM documents WHERE id = %s RETURNING id", (document_id,))
    if not rows:
        raise DocumentNotFoundError("找不到這份文件")
