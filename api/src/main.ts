import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { config } from './config/app.config.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // 前端在另一個 port，開發時需要 CORS
  app.enableCors({ origin: true });
  await app.listen(config.port);
  console.log(`API 已啟動：http://localhost:${config.port}`);
}

bootstrap();
