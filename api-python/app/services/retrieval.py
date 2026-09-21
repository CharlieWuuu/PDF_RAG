"""
檢索相關的純函式。對應 NestJS 版的 retrieval.ts。

為什麼分開：這些邏輯不需要資料庫或金鑰，
放在 service 裡會讓單元測試被迫載入整份設定並要求環境變數。
"""

from dataclasses import dataclass

NO_ANSWER = "資料中找不到相關內容。"


@dataclass
class Source:
    filename: str
    page: int
    content: str
    # cosine distance，0 表示完全相同；除錯與門檻校準用
    distance: float


def is_relevant(sources: list[Source], threshold: float) -> bool:
    """
    只看最佳結果：若連最相近的片段都不夠相關，其餘更不可能相關。
    採嚴格小於，門檻值本身視為不相關。
    """
    return bool(sources) and sources[0].distance < threshold


def build_prompt(question: str, sources: list[Source]) -> tuple[str, str]:
    """
    回傳 (system, user)。

    Prompt 的三個限制缺一不可：
    只能依據片段作答（防幻覺）、不知道就說不知道（給模型退路）、標註出處（讓使用者可驗證）。
    """
    context = "\n\n".join(
        f"[片段 {i + 1}]（檔名：{s.filename}，第 {s.page} 頁）\n{s.content}"
        for i, s in enumerate(sources)
    )

    system = "\n".join(
        [
            "你是一個文件問答助理。請只根據使用者提供的文件片段回答問題。",
            "若片段中沒有足夠資訊，就只回覆「資料中找不到相關內容。」這一句，不要加上任何出處或說明，",
            "也絕對不要依據自身知識補充或推測。",
            "只有在實際引用片段內容作答時，才標註出處，格式為（檔名，第 N 頁）。",
            "無論如何都必須輸出文字，不可以回覆空白。",
            "請使用台灣繁體中文與全形標點作答。",
        ]
    )
    user = f"文件片段：\n\n{context}\n\n問題：{question}"
    return system, user
