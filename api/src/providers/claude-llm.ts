import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config/app.config.js';
import type { LlmMessage, LlmProvider } from './llm.provider.js';

export class ClaudeLlmProvider implements LlmProvider {
  private readonly client = new Anthropic({ apiKey: config.llm.apiKey });

  async *stream(messages: LlmMessage, signal?: AbortSignal): AsyncIterable<string> {
    const stream = this.client.messages.stream(
      {
        model: config.llm.model,
        max_tokens: 1024,
        system: messages.system,
        messages: [{ role: 'user', content: messages.user }],
      },
      // 把 signal 交給 SDK：前端按下停止時，對 Claude 的 HTTP 請求也會真的中斷，
      // 而不是只停止在前端顯示、後端繼續燒 token
      { signal },
    );

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield event.delta.text;
      }
    }
  }
}
