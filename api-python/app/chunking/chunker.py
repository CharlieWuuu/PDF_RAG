"""以段落為單位切塊。對應 NestJS 版的 chunker.ts。"""

from dataclasses import dataclass

from app.pdf.extract import PageText


@dataclass
class Chunk:
    page: int
    chunk_index: int
    content: str


def chunk_pages(pages: list[PageText], size: int, overlap: int) -> list[Chunk]:
    """
    為什麼不用固定長度硬切：段落是語意的自然邊界，
    沿著段落累積到接近目標大小才斷開，能讓每塊保持語意完整，embedding 品質較好。

    size 與 overlap 以字元數計。用字元而非 token：省去 tokenizer 相依，
    且對中文更直觀。

    每塊記錄頁碼，來源標註才有依據；跨頁累積時記首段所在頁。
    """
    chunks: list[Chunk] = []
    buffer = ""
    buffer_page = 1
    # 獨立旗標記錄「目前這塊是否還沒放進任何新段落」。
    # 不能用 buffer 是否為空判斷，因為 flush 後 buffer 會保留 overlap 文字，
    # 那樣會使跨頁時頁碼停留在前一頁，導致出處標註錯誤。
    buffer_empty = True

    def flush() -> None:
        nonlocal buffer, buffer_empty
        content = buffer.strip()
        if content:
            chunks.append(Chunk(page=buffer_page, chunk_index=len(chunks), content=content))
        # 保留尾端 overlap 字元作為下一塊開頭，銜接語意
        buffer = buffer[-overlap:] if overlap > 0 else ""
        buffer_empty = True

    for page in pages:
        for paragraph in page.lines:
            # 單一段落就超過目標大小時，退回固定長度切分，避免產生過大的塊
            if len(paragraph) > size:
                if not buffer_empty:
                    flush()
                buffer_page = page.page
                step = max(size - overlap, 1)
                for start in range(0, len(paragraph), step):
                    buffer = paragraph[start : start + size]
                    flush()
                buffer = ""
                buffer_empty = True
                continue

            if len(buffer) + len(paragraph) > size:
                flush()
            # 這一塊的第一個段落決定頁碼
            if buffer_empty:
                buffer_page = page.page
            buffer += ("\n" if buffer else "") + paragraph
            buffer_empty = False

    if not buffer_empty and buffer.strip():
        chunks.append(Chunk(page=buffer_page, chunk_index=len(chunks), content=buffer.strip()))

    return chunks
