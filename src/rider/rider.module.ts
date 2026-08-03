import { Module } from '@nestjs/common';
import { RiderAuthModule } from './auth/rider-auth.module';
import { RiderProfileModule } from './profile/rider-profile.module';

@Module({
  imports: [RiderAuthModule, RiderProfileModule],
})
export class RiderModule {}
