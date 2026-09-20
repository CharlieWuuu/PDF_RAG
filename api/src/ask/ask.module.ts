import { Module } from '@nestjs/common';
import { AskController } from './ask.controller.js';
import { AskService } from './ask.service.js';
import { LLM_PROVIDER } from '../providers/llm.provider.js';
import { ClaudeLlmProvider } from '../providers/claude-llm.js';
import { DocumentsModule } from '../documents/documents.module.js';

@Module({
  // 重用 DocumentsModule 匯出的 embedding provider：
  // 查詢與匯入必須用同一個模型，否則向量不在同一空間，比對結果無意義
  imports: [DocumentsModule],
  controllers: [AskController],
  providers: [AskService, { provide: LLM_PROVIDER, useClass: ClaudeLlmProvider }],
})
export class AskModule {}
