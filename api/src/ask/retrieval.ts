/**
 * 檢索相關的純函式獨立於此。
 * 為什麼分開：這些邏輯不需要資料庫或金鑰，
 * 放在 service 裡會讓單元測試被迫載入整份設定並要求環境變數。
 */

export interface Source {
  filename: string;
  page: number;
  content: string;
  /** cosine distance，0 表示完全相同；除錯與門檻校準用 */
  distance: number;
}

export const NO_ANSWER = '資料中找不到相關內容。';

/**
 * 只看最佳結果：若連最相近的片段都不夠相關，其餘更不可能相關。
 * 採嚴格小於，門檻值本身視為不相關。
 */
export function isRelevant(sources: Source[], threshold: number): boolean {
  return sources.length > 0 && sources[0].distance < threshold;
}

/**
 * Prompt 的三個限制缺一不可：
 * 只能依據片段作答（防幻覺）、不知道就說不知道（給模型退路）、標註出處（讓使用者可驗證）。
 */
/** 把可用頁碼列給模型，避免它自行推算出不存在的頁碼 */
function pageList(sources: Source[]): string {
  return [...new Set(sources.map((s) => s.page))]
    .sort((a, b) => a - b)
    .map((p) => `第 ${p} 頁`)
    .join('、');
}

export function buildPrompt(question: string, sources: Source[]) {
  const context = sources
    .map((s, i) => `[片段 ${i + 1}]（檔名：${s.filename}，第 ${s.page} 頁）\n${s.content}`)
    .join('\n\n');

  return {
    system: [
      '你是一個文件問答助理。請只根據使用者提供的文件片段回答問題。',
      '若片段中沒有足夠資訊，就只回覆「資料中找不到相關內容。」這一句，不要加上任何出處或說明，',
      '也絕對不要依據自身知識補充或推測。',
      '只有在實際引用片段內容作答時，才標註出處，格式為（檔名，第 N 頁）。',
      `頁碼必須原封不動取自上方片段的標示，只能是 ${pageList(sources)} 其中之一，`,
      '絕對不可以自行推算或填入其他頁碼。',
      '無論如何都必須輸出文字，不可以回覆空白。',
      '請使用台灣繁體中文與全形標點作答。',
    ].join('\n'),
    user: `文件片段：\n\n${context}\n\n問題：${question}`,
  };
}
