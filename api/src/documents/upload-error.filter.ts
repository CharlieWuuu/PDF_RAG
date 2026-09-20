import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { MAX_UPLOAD_BYTES } from './documents.controller.js';

/**
 * multer 超過大小上限時會丟出 code 為 LIMIT_FILE_SIZE 的錯誤，
 * 訊息是英文的 "File too large"，且不是 HttpException，
 * 預設會變成 500。這裡攔下來換成中文訊息與正確的狀態碼。
 */
@Catch()
export class UploadErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const code = (exception as { code?: string })?.code;
    // multer 的原始錯誤 code 是 LIMIT_FILE_SIZE，但 Nest 會先把它
    // 包成 PayloadTooLargeException（413），因此兩種情況都要判斷
    const isTooLarge =
      code === 'LIMIT_FILE_SIZE' ||
      (exception instanceof HttpException &&
        exception.getStatus() === HttpStatus.PAYLOAD_TOO_LARGE);

    if (isTooLarge) {
      const limitMb = Math.round(MAX_UPLOAD_BYTES / 1024 / 1024);
      return res.status(HttpStatus.PAYLOAD_TOO_LARGE).json({
        statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
        message: `檔案過大，上限為 ${limitMb}MB`,
      });
    }

    // 其他錯誤維持原本的行為
    if (exception instanceof HttpException) {
      return res.status(exception.getStatus()).json(exception.getResponse());
    }
    return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: exception instanceof Error ? exception.message : '伺服器錯誤',
    });
  }
}
