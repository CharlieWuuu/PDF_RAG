"""門檻判斷的單元測試。與 NestJS 版的 threshold.test.ts 對應。"""

from app.services.retrieval import Source, is_relevant


def source(distance: float) -> Source:
    return Source(filename="a.pdf", page=1, content="內容", distance=distance)


def test_沒有任何檢索結果時視為不相關():
    assert is_relevant([], 0.55) is False


def test_最佳結果小於門檻時視為相關():
    assert is_relevant([source(0.3), source(0.9)], 0.55) is True


def test_最佳結果超過門檻時視為不相關():
    assert is_relevant([source(0.8), source(0.9)], 0.55) is False


def test_剛好等於門檻時視為不相關():
    assert is_relevant([source(0.55)], 0.55) is False
