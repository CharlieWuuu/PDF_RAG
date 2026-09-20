import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { DocumentsService } from './documents.service.js';

/** 上傳大小上限 20MB，避免單一請求把記憶體吃光 */
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

@Controller('documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Post()
  // 存在記憶體即可：檔案解析完就不再需要，省去清理暫存檔的麻煩
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  async upload(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('請上傳欄位名為 file 的 PDF');
    if (file.mimetype !== 'application/pdf') throw new BadRequestException('只接受 PDF 檔案');
    return this.documents.ingest(file.originalname, file.buffer);
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
