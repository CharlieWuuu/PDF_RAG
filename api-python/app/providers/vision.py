"""視覺模型：讀懂頁面上的圖表，轉成可被檢索的文字。"""

import asyncio

from google import genai
from google.genai import types

from app.config import get_settings

# 最多同時處理幾頁。免費額度有每分鐘請求數限制，
# 併發太高會大量觸發 429，反而更慢
MAX_CONCURRENCY = 3

PROMPT = """這是教科書的一頁。請描述頁面上「圖片、地圖、統計圖表」所呈現的資訊，
讓看不到圖的人也能理解。特別注意圖上標註的數字、百分比與圖例分級。
請保留圖號與圖說（例如「圖1-2-4」）。
不要重述正文段落，只描述圖像內容。
若頁面沒有具資訊價值的圖表（例如純裝飾照片），只回覆「無」。
請使用台灣繁體中文。"""


class GeminiVisionProvider:
    """
    為什麼需要：教科書的統計圖與地圖，關鍵數據是畫在圖上的。
    純文字抽取只會得到「48.3%」這種脫離脈絡的碎片，
    使用者問「原住民族分布在哪」時根本檢索不到。
    """

    def __init__(self) -> None:
        self._client = genai.Client(api_key=get_settings().gemini_api_key)
        self._semaphore = asyncio.Semaphore(MAX_CONCURRENCY)

    async def describe(self, image: bytes) -> str | None:
        """回傳圖表描述；沒有值得描述的內容或呼叫失敗時回傳 None。"""
        async with self._semaphore:
            try:
                response = await self._client.aio.models.generate_content(
                    model=get_settings().vision_model,
                    contents=[
                        types.Part.from_bytes(data=image, mime_type="image/jpeg"),
                        PROMPT,
                    ],
                    config=types.GenerateContentConfig(max_output_tokens=2048),
                )
            except Exception:  # noqa: BLE001
                # 視覺描述是加值功能，失敗時降級為純文字匯入，
                # 不該讓整份文件因為額度用罄就匯入失敗
                return None

            text = (response.text or "").strip()
            return None if not text or text == "無" else text
