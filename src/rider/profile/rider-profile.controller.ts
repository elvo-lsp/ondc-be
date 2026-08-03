import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { mkdirSync } from 'fs';
import { Request } from 'express';
import { OnboardingRiderAuthGuard, RiderJwtPayload } from '../auth/rider-auth.guard';
import { RiderProfileService } from './rider-profile.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UploadDocumentDto } from './dto/upload-document.dto';

const UPLOAD_DIR = join(process.cwd(), 'uploads', 'rider-documents');

@Controller('rider/profile')
@UseGuards(OnboardingRiderAuthGuard)
export class RiderProfileController {
  constructor(private readonly riderProfileService: RiderProfileService) {}

  @Get('me')
  getStatus(@Req() req: Request & { rider: RiderJwtPayload }) {
    return this.riderProfileService.getStatus(req.rider.sub);
  }

  @Post()
  updateProfile(@Req() req: Request & { rider: RiderJwtPayload }, @Body() dto: UpdateProfileDto) {
    return this.riderProfileService.updateProfile(req.rider.sub, dto);
  }

  @Post('documents')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          mkdirSync(UPLOAD_DIR, { recursive: true });
          cb(null, UPLOAD_DIR);
        },
        filename: (_req, file, cb) => {
          const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          cb(null, `${uniqueSuffix}${extname(file.originalname)}`);
        },
      }),
    }),
  )
  uploadDocument(
    @Req() req: Request & { rider: RiderJwtPayload },
    @Body() dto: UploadDocumentDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.riderProfileService.uploadDocument(req.rider.sub, dto.type, file.path);
  }
}
