import { Body, Controller, Post } from '@nestjs/common';
import { RiderAuthService } from './rider-auth.service';
import { RegisterRiderDto } from './dto/register-rider.dto';
import { LoginRiderDto } from './dto/login-rider.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';

@Controller('rider/auth')
export class RiderAuthController {
  constructor(private readonly riderAuthService: RiderAuthService) {}

  @Post('register')
  register(@Body() dto: RegisterRiderDto) {
    return this.riderAuthService.register(dto);
  }

  @Post('login')
  login(@Body() dto: LoginRiderDto) {
    return this.riderAuthService.login(dto);
  }

  @Post('verify-otp')
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.riderAuthService.verifyOtp(dto);
  }
}
