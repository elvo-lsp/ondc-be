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
import { AdminVendorChainsService } from './admin-vendor-chains.service';
import { CreateVendorChainDto } from './dto/create-vendor-chain.dto';
import { UpdateVendorChainDto } from './dto/update-vendor-chain.dto';
import { ListVendorChainsDto } from './dto/list-vendor-chains.dto';

@Controller('admin/vendor-chains')
@UseGuards(AdminAuthGuard)
export class AdminVendorChainsController {
  constructor(
    private readonly adminVendorChainsService: AdminVendorChainsService,
  ) {}

  @Get()
  list(@Req() req: AdminRequest, @Query() query: ListVendorChainsDto) {
    return this.adminVendorChainsService.list(req.admin.partnerId, query);
  }

  @Post()
  create(@Req() req: AdminRequest, @Body() dto: CreateVendorChainDto) {
    return this.adminVendorChainsService.create(
      req.admin.partnerId,
      req.admin.sub,
      dto,
    );
  }

  @Get(':id')
  findOne(@Req() req: AdminRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.adminVendorChainsService.findOne(req.admin.partnerId, id);
  }

  @Patch(':id')
  update(
    @Req() req: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVendorChainDto,
  ) {
    return this.adminVendorChainsService.update(req.admin.partnerId, id, dto);
  }
}
