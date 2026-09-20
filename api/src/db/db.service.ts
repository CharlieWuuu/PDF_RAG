import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool, type PoolClient } from 'pg';
import { config } from '../config/app.config.js';

@Injectable()
export class DbService implements OnModuleDestroy {
  // 用連線池而非每次新建連線：Neon 這類託管資料庫的建線成本高
  private readonly pool = new Pool({ connectionString: config.databaseUrl });

  /**
   * 一律走參數化查詢。
   * 不提供任何字串拼接 SQL 的介面，從根本上杜絕 SQL injection。
   */
  async query<T extends object>(sql: string, params: unknown[] = []): Promise<T[]> {
    const res = await this.pool.query<T>(sql, params);
    return res.rows;
  }

  /**
   * 交易封裝。
   * 匯入 PDF 時「文件紀錄 + 所有 chunk」必須全有或全無，
   * 否則失敗會留下沒有內容的空文件，使用者看得到卻查不到東西。
   */
  async withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      // 無論成敗都要歸還連線，否則連線池會耗盡
      client.release();
    }
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}
