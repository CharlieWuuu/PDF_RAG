"""
P1 的檢查工具：逐頁印出擷取到的文字，不碰資料庫。
目的是在投入 embedding 成本之前，先用肉眼確認課本的擷取品質。

用法：uv run python scripts/inspect_pdf.py <PDF 路徑> [起始頁] [結束頁]
"""

import sys
from pathlib import Path

# 讓腳本能以 app.* 匯入專案模組
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.pdf.extract import extract_pages  # noqa: E402
from app.pdf.header_footer import remove_headers_footers  # noqa: E402


def main() -> None:
    args = sys.argv[1:]
    if not args:
        print("用法：uv run python scripts/inspect_pdf.py <PDF 路徑> [起始頁] [結束頁]")
        raise SystemExit(1)

    path = Path(args[0])
    raw = extract_pages(path.read_bytes())
    pages, removed = remove_headers_footers(raw)

    print(f"檔案：{path}")
    print(f"總頁數：{len(pages)}")
    print("偵測到的頁首／頁尾樣板（# 代表數字）：")
    if not removed:
        print("  （無）")
    for line in removed:
        print(f"  - {line}")

    start = int(args[1]) if len(args) > 1 else 1
    end = int(args[2]) if len(args) > 2 else len(pages)

    for page in pages:
        if not (start <= page.page <= end):
            continue
        chars = sum(len(line) for line in page.lines)
        print()
        print("=" * 60)
        print(f"第 {page.page} 頁（{len(page.lines)} 行、{chars} 字）")
        print("=" * 60)
        # 空頁通常代表掃描版或純圖片，是需要及早發現的問題
        if not page.lines:
            print("（此頁沒有可擷取的文字，可能是掃描圖片）")
        for line in page.lines:
            print(line)


if __name__ == "__main__":
    main()
