import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { RiderAuthController } from './rider-auth.controller';
import { RiderAuthService } from './rider-auth.service';
import { OnboardingRiderAuthGuard } from './rider-auth.guard';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '7d' },
      }),
    }),
  ],
  controllers: [RiderAuthController],
  providers: [RiderAuthService, OnboardingRiderAuthGuard],
  exports: [OnboardingRiderAuthGuard, JwtModule],
})
export class RiderAuthModule {}
