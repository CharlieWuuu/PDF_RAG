import { Module } from '@nestjs/common';
import { AskController } from './ask.controller.js';
import { AskService } from './ask.service.js';
import { LLM_PROVIDER } from '../providers/llm.provider.js';
import { OpenAiLlmProvider } from '../providers/openai-llm.js';
import { DocumentsModule } from '../documents/documents.module.js';

@Module({
  // 重用 DocumentsModule 匯出的 embedding provider：
  // 查詢與匯入必須用同一個模型，否則向量不在同一空間，比對結果無意義
  imports: [DocumentsModule],
  controllers: [AskController],
  // 換 LLM 供應商只需改這一行；ClaudeLlmProvider 仍保留在 providers/ 可隨時換回
  providers: [AskService, { provide: LLM_PROVIDER, useClass: OpenAiLlmProvider }],
})
export class AskModule {}
