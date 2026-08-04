import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../auth/admin-auth.module';
import { AadhaarModule } from '../../aadhaar/aadhaar.module';
import { AdminRidersController } from './admin-riders.controller';
import { AdminRidersService } from './admin-riders.service';

@Module({
  imports: [AdminAuthModule, AadhaarModule],
  controllers: [AdminRidersController],
  providers: [AdminRidersService],
})
export class AdminRidersModule {}
