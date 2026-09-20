import OpenAI from 'openai';
import { config } from '../config/app.config.js';
import type { LlmMessage, LlmProvider } from './llm.provider.js';

/**
 * 與 ClaudeLlmProvider 實作同一個 LlmProvider 介面。
 * 兩者並存是刻意的：證明換供應商只需改 module 的一行綁定，
 * AskService 與 controller 完全不必變動。
 */
export class OpenAiLlmProvider implements LlmProvider {
  private readonly client = new OpenAI({ apiKey: config.llm.apiKey });

  async *stream(messages: LlmMessage, signal?: AbortSignal): AsyncIterable<string> {
    const stream = await this.client.chat.completions.create(
      {
        model: config.llm.model,
        // OpenAI 把 system 當成訊息陣列的第一則，Anthropic 則是獨立參數；
        // 差異吸收在這一層，介面對外維持一致
        messages: [
          { role: 'system', content: messages.system },
          { role: 'user', content: messages.user },
        ],
        max_tokens: 1024,
        stream: true,
      },
      // 把 signal 交給 SDK：前端按下停止時，對 OpenAI 的 HTTP 請求也會真的中斷，
      // 而不是只停止在前端顯示、後端繼續燒 token
      { signal },
    );

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content;
      if (text) yield text;
    }
  }
}
