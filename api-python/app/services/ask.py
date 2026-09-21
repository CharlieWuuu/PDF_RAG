"""檢索與回答。對應 NestJS 版的 ask.service.ts。"""

from collections.abc import AsyncIterator
from typing import Any

from app import db
from app.config import get_settings
from app.providers.base import EmbeddingProvider, LlmProvider
from app.services.retrieval import NO_ANSWER, Source, build_prompt, is_relevant


def _to_vector_literal(vector: list[float]) -> str:
    return "[" + ",".join(str(v) for v in vector) + "]"


async def retrieve(question: str, embedding: EmbeddingProvider) -> list[Source]:
    settings = get_settings()
    vectors = await embedding.embed([question])
    literal = _to_vector_literal(vectors[0])

    # <=> 是 pgvector 的 cosine distance 運算子。
    # 選 cosine 而非 L2：embedding 比較的是語意方向，向量長度不具意義。
    rows = await db.query(
        """SELECT d.filename, c.page, c.content, c.embedding <=> %s AS distance
           FROM chunks c
           JOIN documents d ON d.id = c.document_id
           ORDER BY c.embedding <=> %s
           LIMIT %s""",
        (literal, literal, settings.top_k),
    )

    return [
        Source(
            filename=r["filename"],
            page=r["page"],
            content=r["content"],
            distance=float(r["distance"]),
        )
        for r in rows
    ]


async def answer(
    question: str,
    embedding: EmbeddingProvider,
    llm: LlmProvider,
) -> AsyncIterator[dict[str, Any]]:
    """
    回傳答案的事件串流。

    找不到相關內容時直接回固定訊息，不呼叫 LLM——
    既省成本，也避免模型在沒有依據的情況下編造答案。
    """
    settings = get_settings()
    sources = await retrieve(question, embedding)

    if not is_relevant(sources, settings.similarity_threshold):
        yield {"type": "sources", "sources": []}
        yield {"type": "text", "text": NO_ANSWER}
        return

    # 先送出來源，前端可在文字還沒生成前就顯示出處
    yield {
        "type": "sources",
        "sources": [
            {
                "filename": s.filename,
                "page": s.page,
                "content": s.content,
                "distance": s.distance,
            }
            for s in sources
        ],
    }

    system, user = build_prompt(question, sources)

    produced = False
    async for text in llm.stream(system, user):
        produced = True
        yield {"type": "text", "text": text}

    # 模型偶爾會回傳空串流（例如問題與片段完全無關時）。
    # 若不補這一句，使用者會看到一片空白而不知道發生什麼事
    if not produced:
        yield {"type": "text", "text": NO_ANSWER}
