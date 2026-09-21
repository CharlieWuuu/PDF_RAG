"""偵測並移除重複出現的頁首、頁尾。對應 NestJS 版的 header-footer.ts。"""

import re
from collections import Counter

from app.pdf.extract import PageText

# 只檢查每頁最前／最後幾行，頁首頁尾不會出現在頁面中央
EDGE_LINES = 3
# 出現在超過這個比例的頁面，才視為固定頁首頁尾
REPEAT_RATIO = 0.5

_DIGITS = re.compile(r"\d+")


def remove_headers_footers(pages: list[PageText]) -> tuple[list[PageText], list[str]]:
    """
    為什麼需要：課本每頁都有「第 3 章 光合作用」「- 42 -」這類固定行，
    若不移除，切塊後每一塊都混入相同雜訊，會稀釋 embedding 的語意。

    回傳 (處理後的頁面, 偵測到的樣板清單)。
    """
    # 單頁或雙頁無從判斷「重複」，直接原樣回傳
    if len(pages) < 3:
        return pages, []

    counts: Counter[str] = Counter()
    for page in pages:
        edges = page.lines[:EDGE_LINES] + page.lines[-EDGE_LINES:]
        # 同一頁重複出現的同一行只計一次，避免單頁灌票
        counts.update({_normalize(line) for line in edges if line.strip()})

    threshold = len(pages) * REPEAT_RATIO
    repeated = {line for line, count in counts.items() if count >= threshold}

    cleaned = [
        PageText(
            page=page.page,
            lines=[
                line
                for index, line in enumerate(page.lines)
                if not (_is_edge(index, len(page.lines)) and _normalize(line) in repeated)
            ],
        )
        for page in pages
    ]

    return cleaned, sorted(repeated)


def _is_edge(index: int, total: int) -> bool:
    return index < EDGE_LINES or index >= total - EDGE_LINES


def _normalize(line: str) -> str:
    """
    把頁碼數字換成佔位符再比對。

    因為「- 42 -」和「- 43 -」字面不同但其實是同一個頁尾樣板，
    不正規化的話會各自只出現一次，永遠達不到重複門檻。
    """
    return " ".join(_DIGITS.sub("#", line).split()).lower()
