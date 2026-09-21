"""
Embedding 與 LLM 的介面定義。對應 NestJS 版的 embedding.provider.ts、llm.provider.ts。

用 Protocol 而非抽象基底類別：Python 的結構型別檢查不需要實作類別明確繼承，
換供應商時只要方法簽章相符即可，耦合更低。
"""

from collections.abc import AsyncIterator
from typing import Protocol, runtime_checkable


@runtime_checkable
class EmbeddingProvider(Protocol):
    """之後要換 OpenAI 或 Azure，只需新增一個實作並改組裝處，呼叫端不動。"""

    dimensions: int

    async def embed(self, texts: list[str]) -> list[list[float]]:
        """回傳向量陣列，順序與輸入對應。"""
        ...


@runtime_checkable
class LlmProvider(Protocol):
    """
    一律以串流形式回傳，讓 SSE 可以直接轉發。

    要能中止：前端按下停止時需中斷對 LLM 的請求，
    Python 版靠呼叫端取消 asyncio task 來達成（對應 TS 版的 AbortSignal）。
    """

    def stream(self, system: str, user: str) -> AsyncIterator[str]: ...
