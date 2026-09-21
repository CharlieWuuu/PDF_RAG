# Python 沒有 npm scripts 這種內建捷徑，慣例上用 Makefile 補足。
# 用法：make dev / make test / make inspect FILE=xxx.pdf
#
# 注意：Makefile 的縮排必須是 Tab，不能用空格，否則會報錯。
.PHONY: dev test inspect install

# 若系統已啟用其他 Python 虛擬環境（例如 pyenv），uv 會發出不符的警告。
# 清掉這個變數讓 uv 一律使用本專案的 .venv
unexport VIRTUAL_ENV

# 開發伺服器，--reload 相當於 npm run dev 的熱重載
dev:
	uv run uvicorn app.main:app --reload --port 8000

test:
	uv run pytest -q

# 階段 1 的擷取品質檢查工具
inspect:
	uv run python scripts/inspect_pdf.py $(FILE) $(FROM) $(TO)

install:
	uv sync
