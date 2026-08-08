import { Body, Controller, Post } from '@nestjs/common';
import { RiderAuthService } from './rider-auth.service';
import { RegisterRiderDto } from './dto/register-rider.dto';
import { LoginRiderDto } from './dto/login-rider.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { VerifyLoginOtpDto } from './dto/verify-login-otp.dto';

/**
 * Signup is top-level because only the onboarding app can ever call it. Login is
 * namespaced per app because the two rider apps log in differently: `onboarding/*`
 * here, with `operations/*` reserved for the private app (phone OTP, approved
 * riders only) that is not built yet. See docs/rider/onboarding-api.md.
 */
@Controller('rider/auth')
export class RiderAuthController {
  constructor(private readonly riderAuthService: RiderAuthService) {}

  @Post('register')
  register(@Body() dto: RegisterRiderDto) {
    return this.riderAuthService.register(dto);
  }

  /** Signup verification - phone OTP, and the only path that creates a rider. */
  @Post('verify-otp')
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.riderAuthService.verifyOtp(dto);
  }

  /** Returning-rider login for the onboarding app - email OTP. */
  @Post('onboarding/login')
  login(@Body() dto: LoginRiderDto) {
    return this.riderAuthService.login(dto);
  }

  @Post('onboarding/verify-login-otp')
  verifyLoginOtp(@Body() dto: VerifyLoginOtpDto) {
    return this.riderAuthService.verifyLoginOtp(dto);
  }
}
