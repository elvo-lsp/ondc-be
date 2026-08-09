import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'crypto';
import * as argon2 from 'argon2';
import { PrismaService } from '../../prisma/prisma.service';
import { LoginAdminDto } from './dto/login-admin.dto';

// Verified against when no admin matches, so an unknown email costs the same
// time as a wrong password - otherwise latency alone reveals which emails exist.
const DUMMY_HASH = argon2.hash(randomBytes(32).toString('hex'));

@Injectable()
export class AdminAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(dto: LoginAdminDto): Promise<{ accessToken: string }> {
    const admin = await this.prisma.adminUser.findUnique({
      where: { email: dto.email },
    });

    const hash = admin?.passwordHash ?? (await DUMMY_HASH);
    const valid = await argon2.verify(hash, dto.password).catch(() => false);

    if (!admin || !valid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const accessToken = await this.jwtService.signAsync({
      sub: admin.id,
      partnerId: admin.partnerId,
      app: 'admin',
    });

    return { accessToken };
  }

  async me(adminId: string) {
    const admin = await this.prisma.adminUser.findUnique({
      where: { id: adminId },
      include: { partner: true },
    });

    if (!admin) {
      // 401, not 404: adminId comes from a verified JWT, so a missing row means
      // the token is stale. Only a 401 makes the panel clear the session.
      throw new UnauthorizedException(
        'Your session is no longer valid, please sign in again',
      );
    }

    return {
      id: admin.id,
      name: admin.name,
      email: admin.email,
      partner: { id: admin.partner.id, name: admin.partner.name },
    };
  }
}
