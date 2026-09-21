"""問答端點。對應 NestJS 版的 ask.controller.ts。"""

import json

from fastapi import APIRouter, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.providers.gemini import GeminiEmbeddingProvider, GeminiLlmProvider
from app.services import ask as service

router = APIRouter(tags=["ask"])

# 換供應商只改這兩行；查詢與匯入必須用同一個 embedding 模型，
# 否則向量不在同一空間，比對結果無意義
_embedding = GeminiEmbeddingProvider()
_llm = GeminiLlmProvider()


class AskRequest(BaseModel):
    question: str


@router.post("/ask")
async def ask(body: AskRequest, request: Request):
    """
    用 POST + SSE 而非 GET + EventSource：
    問題可能很長，放在 body 比塞進 query string 合適；
    代價是前端不能用 EventSource，要改用 fetch 讀 ReadableStream。
    """
    question = body.question.strip()
    if not question:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "question 不可為空")

    async def event_stream():
        try:
            async for event in service.answer(question, _embedding, _llm):
                # 前端按下停止會關閉連線。這裡主動偵測並跳出，
                # 讓 async generator 結束、連帶中止對 LLM 的請求，
                # 效果等同 NestJS 版把 AbortSignal 傳給 SDK
                if await request.is_disconnected():
                    break
                yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
            else:
                yield f"data: {json.dumps({'type': 'done'})}\n\n"
        except Exception as err:  # noqa: BLE001
            payload = {"type": "error", "message": str(err)}
            yield f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            # 關掉 nginx 之類的反向代理緩衝，否則串流會被整包快取到結束才吐出
            "X-Accel-Buffering": "no",
        },
    )
