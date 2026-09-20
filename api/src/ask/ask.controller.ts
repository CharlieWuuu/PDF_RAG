import { BadRequestException, Body, Controller, Inject, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AskService } from './ask.service.js';

interface AskDto {
  question?: string;
}

@Controller('ask')
export class AskController {
  constructor(@Inject(AskService) private readonly ask: AskService) {}

  /**
   * 用 POST + SSE 而非 GET + EventSource：
   * 問題可能很長，放在 body 比塞進 query string 合適；
   * 代價是前端不能用 EventSource，要改用 fetch 讀 ReadableStream。
   */
  @Post()
  async askQuestion(@Body() body: AskDto, @Req() req: Request, @Res() res: Response) {
    const question = body.question?.trim();
    if (!question) throw new BadRequestException('question 不可為空');

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    // 關掉 nginx 之類的反向代理緩衝，否則串流會被整包快取到結束才吐出
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // 前端 AbortController 取消時連線會關閉，
    // 這裡把它轉成 AbortSignal 往下傳，讓對 LLM 的請求也真的中止
    const controller = new AbortController();
    req.on('close', () => controller.abort());

    try {
      for await (const event of this.ask.answer(question, controller.signal)) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    } catch (err) {
      // 使用者主動取消不算錯誤，不需回報
      if (!controller.signal.aborted) {
        const message = err instanceof Error ? err.message : '回答產生失敗';
        res.write(`data: ${JSON.stringify({ type: 'error', message })}\n\n`);
      }
    } finally {
      res.end();
    }
  }
}
