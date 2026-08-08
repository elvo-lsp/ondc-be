import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../auth/admin-auth.module';
import { AadhaarModule } from '../../aadhaar/aadhaar.module';
import { RiderDocumentsModule } from '../../rider/documents/rider-documents.module';
import { AdminRidersController } from './admin-riders.controller';
import { AdminRidersService } from './admin-riders.service';

@Module({
  imports: [AdminAuthModule, AadhaarModule, RiderDocumentsModule],
  controllers: [AdminRidersController],
  providers: [AdminRidersService],
})
export class AdminRidersModule {}
