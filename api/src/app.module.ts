import { Module } from '@nestjs/common';
import { DbModule } from './db/db.module.js';
import { DocumentsModule } from './documents/documents.module.js';
import { AskModule } from './ask/ask.module.js';

@Module({ imports: [DbModule, DocumentsModule, AskModule] })
export class AppModule {}
