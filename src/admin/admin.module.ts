import { Module } from '@nestjs/common';
import { AdminAuthModule } from './auth/admin-auth.module';
import { AdminVendorsModule } from './vendors/admin-vendors.module';
import { AdminRidersModule } from './riders/admin-riders.module';

@Module({
  imports: [AdminAuthModule, AdminVendorsModule, AdminRidersModule],
})
export class AdminModule {}
