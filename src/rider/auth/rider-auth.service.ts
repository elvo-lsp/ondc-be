import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomInt } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { RiderStatus } from '../../../generated/prisma/client';
import { RegisterRiderDto } from './dto/register-rider.dto';
import { LoginRiderDto } from './dto/login-rider.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';

const OTP_TTL_SECONDS = 5 * 60;

@Injectable()
export class RiderAuthService {
  private readonly logger = new Logger(RiderAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterRiderDto): Promise<{ message: string }> {
    const GENERIC_MESSAGE = 'If this is a new number, an OTP has been sent';

    const existing = await this.prisma.rider.findFirst({
      where: { OR: [{ email: dto.email }, { phone: dto.phone }] },
    });

    if (existing) {
      // Don't reveal that this email/phone is already registered - resend an
      // OTP to the account's real phone instead of erroring, and return the
      // exact same response as a fresh signup (avoids account enumeration).
      await this.issueOtp(existing.phone);
      return { message: GENERIC_MESSAGE };
    }

    const rider = await this.prisma.rider.create({
      data: { name: dto.name, email: dto.email, phone: dto.phone },
    });

    await this.issueOtp(rider.phone);

    return { message: GENERIC_MESSAGE };
  }

  async login(dto: LoginRiderDto): Promise<{ message: string }> {
    const GENERIC_MESSAGE = 'If this number is registered, an OTP has been sent';

    const rider = await this.prisma.rider.findUnique({ where: { phone: dto.phone } });

    // Same response whether or not the rider exists - only difference is
    // whether an OTP actually gets issued behind the scenes.
    if (rider) {
      await this.issueOtp(rider.phone);
    }

    return { message: GENERIC_MESSAGE };
  }

  async verifyOtp(dto: VerifyOtpDto): Promise<{ accessToken: string; status: RiderStatus }> {
    const rider = await this.prisma.rider.findUnique({ where: { phone: dto.phone } });

    const storedCode = rider ? await this.redis.get(this.otpKey(dto.phone)) : null;

    // Same error whether the phone doesn't exist or the code is wrong -
    // avoids account enumeration via a distinct "not found" response. Only
    // delete the key on a correct match, so a mistyped code doesn't burn the
    // real OTP - the rider can still retry until it expires.
    if (!rider || !storedCode || storedCode !== dto.code) {
      throw new UnauthorizedException('Invalid or expired OTP');
    }

    await this.redis.del(this.otpKey(dto.phone));

    const status =
      rider.status === RiderStatus.PENDING_VERIFICATION
        ? RiderStatus.PROFILE_PENDING
        : rider.status;

    if (status !== rider.status) {
      await this.prisma.rider.update({ where: { id: rider.id }, data: { status } });
    }

    const accessToken = await this.jwtService.signAsync({
      sub: rider.id,
      phone: rider.phone,
      app: 'onboarding',
    });

    return { accessToken, status };
  }

  private async issueOtp(phone: string): Promise<void> {
    const code = randomInt(100000, 1000000).toString();

    await this.redis.set(this.otpKey(phone), code, 'EX', OTP_TTL_SECONDS);

    // TODO: send via real SMS provider - stubbed for now
    this.logger.log(`OTP for ${phone}: ${code} (expires in ${OTP_TTL_SECONDS / 60}m)`);
  }

  private otpKey(phone: string): string {
    return `rider-otp:${phone}`;
  }
}
