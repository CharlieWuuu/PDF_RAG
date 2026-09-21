"""切塊邏輯的單元測試。與 NestJS 版的 chunker.test.ts 對應。"""

from app.chunking.chunker import chunk_pages
from app.pdf.extract import PageText

SIZE = 100
OVERLAP = 20


def test_短文件只產生一塊且保留頁碼():
    chunks = chunk_pages([PageText(page=7, lines=["短短一段文字。"])], SIZE, OVERLAP)
    assert len(chunks) == 1
    assert chunks[0].page == 7
    assert chunks[0].content == "短短一段文字。"


def test_累積超過目標大小時切開且索引連續():
    lines = [f"段落{i}".ljust(40, "字") for i in range(10)]
    chunks = chunk_pages([PageText(page=1, lines=lines)], SIZE, OVERLAP)
    assert len(chunks) > 1
    assert [c.chunk_index for c in chunks] == list(range(len(chunks)))


def test_相鄰塊之間有重疊():
    lines = ["x" * 45 for _ in range(6)]
    chunks = chunk_pages([PageText(page=1, lines=lines)], SIZE, OVERLAP)
    tail = chunks[0].content[-OVERLAP:]
    assert chunks[1].content.startswith(tail)


def test_單一段落超過目標大小時強制切分():
    chunks = chunk_pages([PageText(page=2, lines=["a" * 350])], SIZE, OVERLAP)
    assert len(chunks) > 1
    # 每塊都不應超過目標大小
    assert all(len(c.content) <= SIZE for c in chunks)
    assert all(c.page == 2 for c in chunks)


def test_跨頁時記錄該塊起始所在頁碼():
    chunks = chunk_pages(
        [PageText(page=3, lines=["x" * 95]), PageText(page=4, lines=["y" * 95])],
        SIZE,
        OVERLAP,
    )
    assert chunks[0].page == 3
    assert chunks[-1].page == 4


def test_忽略空白內容不產生空塊():
    chunks = chunk_pages([PageText(page=1, lines=["   ", ""])], SIZE, OVERLAP)
    assert len(chunks) == 0
