import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

export interface AdminJwtPayload {
  sub: string;
  partnerId: string;
  app: 'admin';
}

export type AdminRequest = Request & { admin: AdminJwtPayload };

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context
      .switchToHttp()
      .getRequest<Request & { admin?: AdminJwtPayload }>();
    const authHeader = req.headers['authorization'];

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }

    let payload: AdminJwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<AdminJwtPayload>(
        authHeader.slice('Bearer '.length),
      );
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    // Redundant while the secrets differ, but holds the line if they ever match.
    if (payload.app !== 'admin') {
      throw new UnauthorizedException('Token is not valid for this app');
    }

    req.admin = payload;
    return true;
  }
}
