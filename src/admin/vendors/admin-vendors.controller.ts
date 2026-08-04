import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import type { AdminRequest } from '../auth/admin-auth.guard';
import { AdminVendorsService } from './admin-vendors.service';
import { CreateVendorDto } from './dto/create-vendor.dto';
import { UpdateVendorDto } from './dto/update-vendor.dto';
import { ListVendorsDto } from './dto/list-vendors.dto';

@Controller('admin/vendors')
@UseGuards(AdminAuthGuard)
export class AdminVendorsController {
  constructor(private readonly adminVendorsService: AdminVendorsService) {}

  @Get()
  list(@Req() req: AdminRequest, @Query() query: ListVendorsDto) {
    return this.adminVendorsService.list(req.admin.partnerId, query);
  }

  @Post()
  create(@Req() req: AdminRequest, @Body() dto: CreateVendorDto) {
    return this.adminVendorsService.create(
      req.admin.partnerId,
      req.admin.sub,
      dto,
    );
  }

  @Get(':id')
  findOne(@Req() req: AdminRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.adminVendorsService.findOne(req.admin.partnerId, id);
  }

  @Patch(':id')
  update(
    @Req() req: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVendorDto,
  ) {
    return this.adminVendorsService.update(req.admin.partnerId, id, dto);
  }
}
