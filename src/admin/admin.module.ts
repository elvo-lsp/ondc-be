import { Module } from '@nestjs/common';
import { AdminAuthModule } from './auth/admin-auth.module';
import { AdminVendorsModule } from './vendors/admin-vendors.module';
import { AdminVendorChainsModule } from './vendor-chains/admin-vendor-chains.module';
import { AdminRidersModule } from './riders/admin-riders.module';

@Module({
  imports: [
    AdminAuthModule,
    AdminVendorsModule,
    AdminVendorChainsModule,
    AdminRidersModule,
  ],
})
export class AdminModule {}
