"""文件相關端點。對應 NestJS 版的 documents.controller.ts。"""

from uuid import UUID

from fastapi import APIRouter, File, HTTPException, UploadFile, status

from app.providers.gemini import GeminiEmbeddingProvider
from app.services import documents as service

router = APIRouter(prefix="/documents", tags=["documents"])

# 教科書多為圖文混排，圖片佔去絕大部分體積（文字其實不多），
# 30～40MB 很常見，因此上限放寬到 100MB
MAX_UPLOAD_BYTES = 100 * 1024 * 1024

# 換 embedding 供應商只改這一行
_embedding = GeminiEmbeddingProvider()


@router.post("")
async def upload(file: UploadFile = File(...)):  # noqa: B008 - FastAPI 的慣用寫法
    if file.content_type != "application/pdf":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "只接受 PDF 檔案")

    data = await file.read()
    if len(data) > MAX_UPLOAD_BYTES:
        limit_mb = MAX_UPLOAD_BYTES // 1024 // 1024
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, f"檔案過大，上限為 {limit_mb}MB")

    # FastAPI 依 RFC 2231 正確解碼檔名，
    # 不像 multer 需要額外處理中文檔名的 latin1 問題
    try:
        result = await service.ingest(file.filename or "未命名.pdf", data, _embedding)
    except service.NoTextError as err:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(err)) from err

    return result


@router.get("")
async def list_documents():
    return await service.list_documents()


@router.delete("/{document_id}")
async def remove(document_id: UUID):
    """型別註記為 UUID，格式不對時 FastAPI 會直接回 422，擋在進入 SQL 之前。"""
    try:
        await service.remove(str(document_id))
    except service.DocumentNotFoundError as err:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(err)) from err
    return {"ok": True}
