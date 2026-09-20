import { Module } from '@nestjs/common';
import { DocumentsController } from './documents.controller.js';
import { DocumentsService } from './documents.service.js';
import { EMBEDDING_PROVIDER } from '../providers/embedding.provider.js';
import { GeminiEmbeddingProvider } from '../providers/gemini-embedding.js';

@Module({
  controllers: [DocumentsController],
  providers: [
    DocumentsService,
    // 換 embedding 供應商只改這一行；OpenAiEmbeddingProvider 仍保留可隨時換回
    { provide: EMBEDDING_PROVIDER, useClass: GeminiEmbeddingProvider },
  ],
  exports: [EMBEDDING_PROVIDER],
})
export class DocumentsModule {}
