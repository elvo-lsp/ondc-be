import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { randomInt } from 'crypto';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { prismaUniqueConstraintFields } from '../../prisma/prisma-errors';
import { Prisma, RiderStatus } from '../../../generated/prisma/client';
import { RegisterRiderDto } from './dto/register-rider.dto';
import { LoginRiderDto } from './dto/login-rider.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { VerifyLoginOtpDto } from './dto/verify-login-otp.dto';

const OTP_TTL_SECONDS = 5 * 60;

interface OtpPayload {
  code: string;
  name?: string;
  phone?: string;
}

/**
 * Emails are stored lowercased so every lookup can be an exact `findUnique`.
 * Two reasons not to match case-insensitively on read instead:
 *
 * 1. Prisma's `mode: 'insensitive'` compiles to `ILIKE`, which treats the value as
 *    a *pattern*, and `@IsEmail()` accepts `%` and `_`. `"%@gmail.com"` would
 *    match an arbitrary rider and send them a login OTP; `john_doe@` would match
 *    `john.doe@`, mailing a code to the wrong inbox.
 * 2. The `@unique` index is case-sensitive, so without normalising `a@x.com` and
 *    `A@x.com` are two riders sharing one lowercased OTP key.
 */
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Phones are stored E.164 for the same reason as emails: the unique index is on
 * the raw string, and `IsPhoneNumber('IN')` accepts `+919864886447`,
 * `09864886447`, `9864886447` and `+91 98648 86447` as the same number - so
 * without this one person registers four times, each a separate rider.
 */
export function normalisePhone(phone: string): string {
  return parsePhoneNumberFromString(phone.trim(), 'IN')?.number ?? phone.trim();
}

/** A malformed value reads as "no OTP issued", so the caller gets a 401 not a 500. */
function readOtpPayload(raw: string | null): OtpPayload | null {
  if (!raw) return null;

  try {
    return JSON.parse(raw) as OtpPayload;
  } catch {
    return null;
  }
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

  /**
   * The onboarding app verifies by email end to end - this and `verifyOtp` are
   * the signup half, `login`/`verifyLoginOtp` the returning-rider half. Phone is
   * collected and stored (unique, `IsPhoneNumber('IN')` format-checked) but never
   * proven here. The private operations app, not built yet, is where phone OTP
   * belongs - see docs/rider/onboarding-api.md.
   */
  async register(dto: RegisterRiderDto): Promise<{ message: string }> {
    const email = normaliseEmail(dto.email);
    const phone = normalisePhone(dto.phone);

    const existing = await this.prisma.rider.findFirst({
      where: { OR: [{ email }, { phone }] },
    });

    // A returning rider uses onboarding/login, not this.
    if (existing) {
      throw new ConflictException(
        'An account with this email or phone number already exists',
      );
    }

    // No Postgres write here - the rider is only created once the email is
    // proven via verifyOtp. Pending name/phone travel with the OTP in Redis.
    await this.issueRegistrationOtp(email, { name: dto.name, phone });

    return { message: 'An OTP has been sent' };
  }

  /**
   * Returning-rider login for the onboarding app. Email rather than phone: a rider
   * reinstalling weeks later is likelier to still have their inbox than to recall
   * which number they signed up with, and it verifies the second contact detail.
   */
  async login(dto: LoginRiderDto): Promise<{ message: string }> {
    const GENERIC_MESSAGE = 'If this email is registered, an OTP has been sent';

    const rider = await this.findRiderByEmail(dto.email);

    if (rider) {
      await this.issueEmailOtp(rider.email);
    }

    return { message: GENERIC_MESSAGE };
  }

  /**
   * Never creates a rider, unlike `verifyOtp`. That is why the two verifications
   * are separate endpoints with separate Redis namespaces: a login OTP must not be
   * redeemable against the path that can insert a row.
   */
  async verifyLoginOtp(
    dto: VerifyLoginOtpDto,
  ): Promise<{ accessToken: string; status: RiderStatus }> {
    const rider = await this.findRiderByEmail(dto.email);

    if (!rider) {
      // Same message as a wrong code - the response must not reveal whether the
      // address is registered.
      throw new UnauthorizedException('Invalid or expired OTP');
    }

    const key = this.loginOtpKey(rider.email);
    const raw = await this.redis.get(key);
    const stored = readOtpPayload(raw);

    if (!stored || stored.code !== dto.code) {
      throw new UnauthorizedException('Invalid or expired OTP');
    }

    await this.redis.del(key);

    const accessToken = await this.jwtService.signAsync({
      sub: rider.id,
      phone: rider.phone,
      app: 'onboarding',
    });

    return { accessToken, status: rider.status };
  }

  async verifyOtp(
    dto: VerifyOtpDto,
  ): Promise<{ accessToken: string; status: RiderStatus }> {
    const email = normaliseEmail(dto.email);

    let rider = await this.prisma.rider.findUnique({ where: { email } });

    const key = this.registrationOtpKey(email);
    const raw = await this.redis.get(key);
    const stored = readOtpPayload(raw);

    if (!stored || stored.code !== dto.code) {
      throw new UnauthorizedException('Invalid or expired OTP');
    }

    await this.redis.del(key);

    if (!rider) {
      // register() always stores name/phone for a brand-new email - a missing
      // one means a stale/malformed entry.
      if (!stored.name || !stored.phone) {
        throw new UnauthorizedException('Invalid or expired OTP');
      }

      try {
        rider = await this.prisma.rider.create({
          data: {
            name: stored.name,
            email,
            phone: stored.phone,
            status: RiderStatus.PROFILE_PENDING,
            partnerId: await this.resolveDefaultPartnerId(),
          },
        });
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          // This email just proved ownership via OTP, so a collision on it here
          // is only a concurrent verify of the same signup - not worth a
          // different message. A phone collision is a genuinely different
          // account. Safe to name which, unlike register(), since this request
          // already proved it controls the email it is complaining about.
          throw new ConflictException(
            prismaUniqueConstraintFields(err).includes('phone')
              ? 'This phone number is already registered to another account'
              : 'This email is already registered',
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

  private async issueRegistrationOtp(
    email: string,
    pending?: { name: string; phone: string },
  ): Promise<void> {
    const code = randomInt(100000, 1000000).toString();
    const payload: OtpPayload = { code, ...pending };

    await this.redis.set(
      this.registrationOtpKey(email),
      JSON.stringify(payload),
      'EX',
      OTP_TTL_SECONDS,
    );

    // TODO: send via a real mail provider - stubbed for now, same as login.
    this.logger.log(
      `Registration OTP for ${email}: ${code} (expires in ${OTP_TTL_SECONDS / 60}m)`,
    );
  }

  private async issueEmailOtp(email: string): Promise<void> {
    const code = randomInt(100000, 1000000).toString();
    const payload: OtpPayload = { code };

    await this.redis.set(
      this.loginOtpKey(email),
      JSON.stringify(payload),
      'EX',
      OTP_TTL_SECONDS,
    );

    // TODO: send via a real mail provider - stubbed like SMS. Logging a login code
    // in plaintext is tracked in docs/infra/security-debt.md.
    this.logger.log(
      `Login OTP for ${email}: ${code} (expires in ${OTP_TTL_SECONDS / 60}m)`,
    );
  }

  // Must never become an `insensitive` match - see normaliseEmail.
  private findRiderByEmail(email: string) {
    return this.prisma.rider.findUnique({
      where: { email: normaliseEmail(email) },
    });
  }

  // Separate namespace from the login OTP - see verifyLoginOtp. A code here can
  // create a rider; a login code must never be redeemable against this key.
  private registrationOtpKey(email: string): string {
    return `rider-otp:${normaliseEmail(email)}`;
  }

  private loginOtpKey(email: string): string {
    return `rider-login-otp:${normaliseEmail(email)}`;
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
