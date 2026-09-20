import {
  BadRequestException,
  Inject,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseFilters,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { DocumentsService } from './documents.service.js';
import { UploadErrorFilter } from './upload-error.filter.js';

/**
 * 上傳大小上限。
 * 教科書多為圖文混排，圖片佔去絕大部分體積（文字其實不多），
 * 30～40MB 很常見，因此上限放寬到 100MB。
 */
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

/**
 * multer 依 RFC 2047 以 latin1 解讀 multipart 的檔名，
 * 中文檔名會變成亂碼（例如「地理」→「åœ°ç†」）。
 * 這裡轉回 UTF-8，否則回答標註出處時檔名會是亂碼。
 */
function decodeFilename(name: string): string {
  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  // 若還原後出現替代字元，代表原本就是 UTF-8，維持原值即可
  return decoded.includes('\uFFFD') ? name : decoded;
}

@Controller('documents')
export class DocumentsController {
  constructor(@Inject(DocumentsService) private readonly documents: DocumentsService) {}

  @Post()
  @UseFilters(UploadErrorFilter)
  // 存在記憶體即可：檔案解析完就不再需要，省去清理暫存檔的麻煩
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_UPLOAD_BYTES },
      // multer 預設的超限錯誤是英文的 "File too large"，
      // 這裡換成中文並附上實際上限，使用者才知道該怎麼辦
      fileFilter: (_req: Request, uploaded, cb) => {
        if (uploaded.mimetype !== 'application/pdf') {
          return cb(new BadRequestException('只接受 PDF 檔案'), false);
        }
        cb(null, true);
      },
    }),
  )
  async upload(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('請上傳欄位名為 file 的 PDF');
    if (file.mimetype !== 'application/pdf') throw new BadRequestException('只接受 PDF 檔案');
    return this.documents.ingest(decodeFilename(file.originalname), file.buffer);
  }

  @Get()
  async list() {
    return this.documents.list();
  }

  @Delete(':id')
  // ParseUUIDPipe：格式不對就擋在進入 SQL 之前
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.documents.remove(id);
    return { ok: true };
  }
}
