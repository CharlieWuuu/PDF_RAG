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
        // maxOutputTokens 同時涵蓋內部推理與正文。Gemini 2.5 預設會先「思考」，
        // 實測 1024 的額度有 980 被推理吃掉、只剩 40 給正文而遭截斷，
        // 因此關掉思考預算並放寬上限——文件問答是照片段作答，不需要深度推理
        thinkingConfig: { thinkingBudget: 0 },
        maxOutputTokens: 4096,
        // 前端按下停止時中斷對 Gemini 的請求，而不是只停在前端顯示
        abortSignal: signal,
      },
    });

    for await (const chunk of stream) {
      if (chunk.text) yield chunk.text;
    }
  }
}
