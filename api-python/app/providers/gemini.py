"""Gemini 的 embedding 與生成實作。對應 NestJS 版的 gemini-embedding.ts、gemini-llm.ts。"""

import asyncio
from collections.abc import AsyncIterator

from google import genai
from google.genai import types

from app.config import get_settings

# 每批送出的文字數上限，避免單次請求過大被 API 拒絕
BATCH_SIZE = 32
# 免費額度有每分鐘請求數限制，撞到時退避重試
MAX_RETRIES = 4


def _client() -> genai.Client:
    return genai.Client(api_key=get_settings().gemini_api_key)


class GeminiEmbeddingProvider:
    def __init__(self) -> None:
        self.dimensions = get_settings().embedding_dimensions
        self._client = _client()

    async def embed(self, texts: list[str]) -> list[list[float]]:
        result: list[list[float]] = []

        for start in range(0, len(texts), BATCH_SIZE):
            batch = texts[start : start + BATCH_SIZE]
            response = await self._with_retry(
                lambda b=batch: self._client.aio.models.embed_content(
                    model=get_settings().embedding_model,
                    contents=b,
                    config=types.EmbedContentConfig(
                        # Gemini 預設 3072 維，這裡指定 1536 以沿用既有的 vector(1536) 欄位。
                        # 這正是把維度放進設定的用意：換供應商不必改 DDL
                        output_dimensionality=self.dimensions
                    ),
                )
            )

            vectors = [list(e.values or []) for e in (response.embeddings or [])]
            if len(vectors) != len(batch):
                raise RuntimeError(
                    f"Gemini 回傳的向量數量不符：預期 {len(batch)}，實得 {len(vectors)}"
                )
            result.extend(vectors)

        return result

    async def _with_retry(self, call):
        """
        免費額度的每分鐘請求數限制很容易在匯入大檔時撞到，
        用指數退避重試，避免整份文件因為一次 429 就整批失敗。
        """
        for attempt in range(MAX_RETRIES + 1):
            try:
                return await call()
            except Exception as err:  # noqa: BLE001 - SDK 的例外型別不穩定，統一判斷訊息
                message = str(err)
                retryable = "429" in message or "RESOURCE_EXHAUSTED" in message or "503" in message
                if not retryable or attempt >= MAX_RETRIES:
                    raise
                await asyncio.sleep(2**attempt)
        raise RuntimeError("unreachable")


class GeminiLlmProvider:
    def __init__(self) -> None:
        self._client = _client()

    async def stream(self, system: str, user: str) -> AsyncIterator[str]:
        settings = get_settings()
        try:
            stream = await self._client.aio.models.generate_content_stream(
                model=settings.llm_model,
                contents=user,
                config=types.GenerateContentConfig(
                    # Gemini 把 system 放在 system_instruction，
                    # OpenAI 放在訊息陣列、Anthropic 是獨立參數——差異都吸收在 provider 這層
                    system_instruction=system,
                    # max_output_tokens 同時涵蓋內部推理與正文，設太小會導致
                    # 推理吃光額度、正文被截斷，因此放寬到 8192
                    max_output_tokens=8192,
                ),
            )
            async for chunk in stream:
                if chunk.text:
                    yield chunk.text
        except Exception as err:  # noqa: BLE001
            message = str(err)
            # 免費額度用罄時回 429，原始訊息是巢狀 JSON 難以閱讀，換成中文提示
            if "429" in message or "RESOURCE_EXHAUSTED" in message:
                raise RuntimeError("已達 Gemini 免費額度上限，請稍後再試或更換模型。") from err
            raise
