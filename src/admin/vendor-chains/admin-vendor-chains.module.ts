import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../auth/admin-auth.module';
import { AdminVendorChainsController } from './admin-vendor-chains.controller';
import { AdminVendorChainsService } from './admin-vendor-chains.service';

@Module({
  imports: [AdminAuthModule],
  controllers: [AdminVendorChainsController],
  providers: [AdminVendorChainsService],
})
export class AdminVendorChainsModule {}
