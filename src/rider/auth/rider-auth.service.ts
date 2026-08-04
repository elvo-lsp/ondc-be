import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { randomInt } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { Prisma, RiderStatus } from '../../../generated/prisma/client';
import { RegisterRiderDto } from './dto/register-rider.dto';
import { LoginRiderDto } from './dto/login-rider.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';

const OTP_TTL_SECONDS = 5 * 60;

interface OtpPayload {
  code: string;
  name?: string;
  email?: string;
}

@Injectable()
export class RiderAuthService {
  private readonly logger = new Logger(RiderAuthService.name);
  private defaultPartnerId: string | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterRiderDto): Promise<{ message: string }> {
    const GENERIC_MESSAGE = 'If this is a new number, an OTP has been sent';

    const existing = await this.prisma.rider.findFirst({
      where: { OR: [{ email: dto.email }, { phone: dto.phone }] },
    });

    if (existing) {
      await this.issueOtp(existing.phone);
      return { message: GENERIC_MESSAGE };
    }

    // No Postgres write here - the rider is only created once the phone is
    // proven via verifyOtp. Pending name/email travel with the OTP in Redis.
    await this.issueOtp(dto.phone, { name: dto.name, email: dto.email });

    return { message: GENERIC_MESSAGE };
  }

  async login(dto: LoginRiderDto): Promise<{ message: string }> {
    const GENERIC_MESSAGE =
      'If this number is registered, an OTP has been sent';

    const rider = await this.prisma.rider.findUnique({
      where: { phone: dto.phone },
    });

    if (rider) {
      await this.issueOtp(rider.phone);
    }

    return { message: GENERIC_MESSAGE };
  }

  async verifyOtp(
    dto: VerifyOtpDto,
  ): Promise<{ accessToken: string; status: RiderStatus }> {
    let rider = await this.prisma.rider.findUnique({
      where: { phone: dto.phone },
    });

    const raw = await this.redis.get(this.otpKey(dto.phone));
    const stored: OtpPayload | null = raw ? JSON.parse(raw) : null;

    if (!stored || stored.code !== dto.code) {
      throw new UnauthorizedException('Invalid or expired OTP');
    }

    await this.redis.del(this.otpKey(dto.phone));

    if (!rider) {
      // register() always stores name/email for a brand-new phone - a
      // missing one means a stale/malformed entry.
      if (!stored.name || !stored.email) {
        throw new UnauthorizedException('Invalid or expired OTP');
      }

      try {
        rider = await this.prisma.rider.create({
          data: {
            name: stored.name,
            email: stored.email,
            phone: dto.phone,
            status: RiderStatus.PROFILE_PENDING,
            partnerId: await this.resolveDefaultPartnerId(),
          },
        });
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          // Two phones raced to verify with the same email. Safe to reveal
          // here (unlike register()) since this rider already proved phone ownership.
          throw new ConflictException(
            'This email is already associated with another account',
          );
        }
        throw err;
      }
    }

    const accessToken = await this.jwtService.signAsync({
      sub: rider.id,
      phone: rider.phone,
      app: 'onboarding',
    });

    return { accessToken, status: rider.status };
  }

  private async issueOtp(
    phone: string,
    pending?: { name: string; email: string },
  ): Promise<void> {
    const code = randomInt(100000, 1000000).toString();
    const payload: OtpPayload = { code, ...pending };

    await this.redis.set(
      this.otpKey(phone),
      JSON.stringify(payload),
      'EX',
      OTP_TTL_SECONDS,
    );

    // TODO: send via real SMS provider - stubbed for now
    this.logger.log(
      `OTP for ${phone}: ${code} (expires in ${OTP_TTL_SECONDS / 60}m)`,
    );
  }

  private otpKey(phone: string): string {
    return `rider-otp:${phone}`;
  }

  // The onboarding app serves a single partner, so every signup through it
  // belongs to that one. By code rather than id so .env survives a reseed.
  // A second partner makes this per-app or per-invite - see
  // docs/admin/README.md.
  private async resolveDefaultPartnerId(): Promise<string> {
    if (this.defaultPartnerId) {
      return this.defaultPartnerId;
    }

    const code = this.config.getOrThrow<string>('DEFAULT_PARTNER_CODE');
    const partner = await this.prisma.partner.findUnique({ where: { code } });

    if (!partner) {
      throw new Error(
        `No partner with code "${code}" - run \`npx prisma db seed\``,
      );
    }

    this.defaultPartnerId = partner.id;
    return partner.id;
  }
}
