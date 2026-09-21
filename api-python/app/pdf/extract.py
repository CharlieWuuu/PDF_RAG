"""PDF 逐頁文字擷取。對應 NestJS 版的 pdf-extract.ts。"""

from dataclasses import dataclass, field

import pymupdf


@dataclass
class PageText:
    """頁碼從 1 開始，對使用者顯示時不需再換算。"""

    page: int
    lines: list[str] = field(default_factory=list)


def extract_pages(data: bytes) -> list[PageText]:
    """
    逐頁擷取文字，保留頁碼。

    為什麼用 PyMuPDF：它的 get_text("blocks") 會直接回傳帶座標的文字區塊，
    座標資訊是日後處理雙欄排版的基礎（可依 x 座標分欄再各自排序）。
    NestJS 版用的 pdfjs 只能拿到更零碎的字元片段，需要自己分群成行。
    """
    pages: list[PageText] = []

    # 以 context manager 開啟，確保例外時檔案仍會關閉
    with pymupdf.open(stream=data, filetype="pdf") as doc:
        for index, page in enumerate(doc, start=1):
            pages.append(PageText(page=index, lines=_extract_lines(page)))

    return pages


def _extract_lines(page: pymupdf.Page) -> list[str]:
    """
    把頁面的文字區塊整理成「行」。

    blocks 的每個元素是 (x0, y0, x1, y1, text, block_no, block_type)，
    其中 block_type 為 0 才是文字（1 是圖片）。
    先依 y 再依 x 排序，才是由上而下、由左而右的閱讀順序。
    """
    blocks = [b for b in page.get_text("blocks") if b[6] == 0]
    blocks.sort(key=lambda b: (round(b[1]), b[0]))

    lines: list[str] = []
    for block in blocks:
        text = block[4]
        # 直排標題會被拆成每字一行，需先合併，否則切塊時變成一堆單字雜訊
        if _is_vertical(text):
            merged = "".join(text.split())
            if merged:
                lines.append(merged)
            continue

        # 區塊內部可能含多行，逐行拆開並去除多餘空白
        for raw_line in text.splitlines():
            line = " ".join(raw_line.split())
            if line:
                lines.append(line)

    return lines


# 直排文字每行只有一個字，需要連續數行都如此才判定，避免誤判正常的短行
_VERTICAL_MIN_LINES = 3


def _is_vertical(text: str) -> bool:
    """
    判斷區塊是否為直排文字。

    PyMuPDF 會把直排標題的每個字當成獨立的一行，
    例如「聽見台北」變成四行。若不合併，切塊後會產生大量單字雜訊。
    """
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    if len(lines) < _VERTICAL_MIN_LINES:
        return False
    return all(len(line) == 1 for line in lines)
