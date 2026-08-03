import { Module } from '@nestjs/common';
import { RiderAuthModule } from '../auth/rider-auth.module';
import { RiderProfileController } from './rider-profile.controller';
import { RiderProfileService } from './rider-profile.service';

@Module({
  imports: [RiderAuthModule],
  controllers: [RiderProfileController],
  providers: [RiderProfileService],
})
export class RiderProfileModule {}
