import { GoogleGenAI } from '@google/genai';
import { config } from '../config/app.config.js';
import type { LlmMessage, LlmProvider } from './llm.provider.js';

export class GeminiLlmProvider implements LlmProvider {
  private readonly client = new GoogleGenAI({ apiKey: config.llm.apiKey });

  async *stream(messages: LlmMessage, signal?: AbortSignal): AsyncIterable<string> {
    const stream = await this.client.models.generateContentStream({
      model: config.llm.model,
      contents: messages.user,
      config: {
        // Gemini 把 system 放在 config.systemInstruction，
        // OpenAI 放在訊息陣列、Anthropic 是獨立參數——差異都吸收在 provider 這層
        systemInstruction: messages.system,
        // maxOutputTokens 同時涵蓋內部推理與正文。實測 1024 的額度曾有 980
        // 被推理吃掉、只剩 40 給正文而遭截斷，因此放寬到 8192 保留足夠空間。
        // 註：Gemini 3.x 不接受 thinkingBudget: 0（會回 400），
        // 因此改以放寬上限的方式處理，而非關閉思考
        maxOutputTokens: 8192,
        // 前端按下停止時中斷對 Gemini 的請求，而不是只停在前端顯示
        abortSignal: signal,
      },
    });

    try {
      for await (const chunk of stream) {
        if (chunk.text) yield chunk.text;
      }
    } catch (err) {
      // 免費額度用罄時 Gemini 回 429，原始訊息是巢狀 JSON 難以閱讀，
      // 這裡換成使用者看得懂的中文提示
      const status = (err as { status?: number })?.status;
      const message = String((err as Error)?.message ?? '');
      if (status === 429 || message.includes('429') || message.includes('RESOURCE_EXHAUSTED')) {
        throw new Error('已達 Gemini 免費額度上限，請稍後再試或更換模型。');
      }
      throw err;
    }
  }
}
