export interface LlmMessage {
  system: string;
  user: string;
}

/**
 * LLM 介面。
 * 一律以串流形式回傳：階段 3 只是把串流收集成完整字串，
 * 階段 4 直接轉發給 SSE，介面不需要改。
 *
 * signal 從一開始就放進介面：階段 4 的「停止」按鈕需要中止對 LLM 的請求，
 * 先預留可避免屆時修改所有呼叫端。
 */
export interface LlmProvider {
  stream(messages: LlmMessage, signal?: AbortSignal): AsyncIterable<string>;
}

export const LLM_PROVIDER = Symbol('LLM_PROVIDER');
