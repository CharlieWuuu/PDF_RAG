"""把 PDF 頁面渲染成圖片。供截圖儲存與視覺模型讀圖使用。"""

import pymupdf

# 150 DPI：實測統計圖的圖例與標註數字都清晰可辨，單頁約 400KB。
# 再高對辨識度幫助有限，但檔案與 API 傳輸成本會明顯上升
RENDER_DPI = 150
JPEG_QUALITY = 80


def render_page(doc: pymupdf.Document, page_number: int) -> bytes:
    """回傳該頁的 JPEG 二進位。page_number 從 1 開始。"""
    pixmap = doc[page_number - 1].get_pixmap(dpi=RENDER_DPI)
    return pixmap.tobytes("jpeg", jpg_quality=JPEG_QUALITY)


def has_images(doc: pymupdf.Document, page_number: int) -> bool:
    """
    判斷該頁是否含圖片。

    只對有圖的頁面呼叫視覺模型，純文字頁送過去是浪費額度，
    描述出來的內容也對檢索沒有幫助。
    """
    return len(doc[page_number - 1].get_images()) > 0
