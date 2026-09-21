# 多階段建置：最終映像檔不含建置工具，體積較小
FROM python:3.11-slim AS build
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
WORKDIR /app
COPY pyproject.toml uv.lock ./
# --frozen：嚴格依照 lock 檔安裝，確保建置結果可重現
RUN uv sync --frozen --no-dev --no-install-project

FROM python:3.11-slim
WORKDIR /app
ENV PATH="/app/.venv/bin:$PATH"
COPY --from=build /app/.venv /app/.venv
COPY app ./app
EXPOSE 8000
# Render 等平台會以 PORT 環境變數指定埠號，寫死會啟動失敗；
# 用 shell 形式的 CMD 才能展開變數，本機則沿用 8000
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
