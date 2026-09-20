import { Global, Module } from '@nestjs/common';
import { DbService } from './db.service.js';

// 標記為 Global：資料庫是全專案共用的基礎設施，
// 免得每個 feature module 都要重複 import
@Global()
@Module({ providers: [DbService], exports: [DbService] })
export class DbModule {}
