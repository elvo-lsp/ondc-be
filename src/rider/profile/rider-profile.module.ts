import { Module } from '@nestjs/common';
import { RiderAuthModule } from '../auth/rider-auth.module';
import { AadhaarModule } from '../../aadhaar/aadhaar.module';
import { RiderDocumentsModule } from '../documents/rider-documents.module';
import { RiderProfileController } from './rider-profile.controller';
import { RiderProfileService } from './rider-profile.service';

@Module({
  imports: [RiderAuthModule, AadhaarModule, RiderDocumentsModule],
  controllers: [RiderProfileController],
  providers: [RiderProfileService],
})
export class RiderProfileModule {}
