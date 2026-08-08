import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import type { AdminRequest } from '../auth/admin-auth.guard';
import { AdminRidersService } from './admin-riders.service';
import { ListRidersDto } from './dto/list-riders.dto';
import { ApproveRiderDto } from './dto/approve-rider.dto';
import { RejectRiderDto } from './dto/reject-rider.dto';
import { ReviewDocumentDto } from './dto/review-document.dto';

@Controller('admin/riders')
@UseGuards(AdminAuthGuard)
export class AdminRidersController {
  constructor(private readonly adminRidersService: AdminRidersService) {}

  @Get()
  list(@Req() req: AdminRequest, @Query() query: ListRidersDto) {
    return this.adminRidersService.list(req.admin.partnerId, query);
  }

  @Get(':id')
  findOne(@Req() req: AdminRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.adminRidersService.findOne(
      req.admin.partnerId,
      req.admin.sub,
      id,
    );
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  approve(
    @Req() req: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveRiderDto,
  ) {
    return this.adminRidersService.approve(
      req.admin.partnerId,
      req.admin.sub,
      id,
      dto,
    );
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  reject(
    @Req() req: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectRiderDto,
  ) {
    return this.adminRidersService.reject(
      req.admin.partnerId,
      req.admin.sub,
      id,
      dto,
    );
  }

  @Post(':id/documents/:documentId/review')
  @HttpCode(HttpStatus.OK)
  reviewDocument(
    @Req() req: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Body() dto: ReviewDocumentDto,
  ) {
    return this.adminRidersService.reviewDocument(
      req.admin.partnerId,
      req.admin.sub,
      id,
      documentId,
      dto,
    );
  }

  @Get(':id/documents/:documentId/file')
  async getDocumentFile(
    @Req() req: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { file, contentType, filename } =
      await this.adminRidersService.getDocumentFile(
        req.admin.partnerId,
        id,
        documentId,
      );

    res.set({
      'Content-Type': contentType,
      'Content-Disposition': `inline; filename="${filename}"`,
      'X-Content-Type-Options': 'nosniff',
    });

    return file;
  }
}
