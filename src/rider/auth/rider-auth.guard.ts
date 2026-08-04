import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

export type RiderApp = 'onboarding' | 'operations';

export interface RiderJwtPayload {
  sub: string;
  phone: string;
  app: RiderApp;
}

@Injectable()
export abstract class BaseRiderAuthGuard implements CanActivate {
  protected abstract readonly requiredApp: RiderApp;

  constructor(protected readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context
      .switchToHttp()
      .getRequest<Request & { rider?: RiderJwtPayload }>();
    const authHeader = req.headers['authorization'];

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const token = authHeader.slice('Bearer '.length);

    let payload: RiderJwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<RiderJwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    // A token issued for one rider-facing app must never work against another -
    // e.g. the Play Store onboarding app's token must not authenticate against
    // the private operations app, even though both are the same rider identity.
    if (payload.app !== this.requiredApp) {
      throw new UnauthorizedException('Token is not valid for this app');
    }

    req.rider = payload;
    return true;
  }
}

@Injectable()
export class OnboardingRiderAuthGuard extends BaseRiderAuthGuard {
  protected readonly requiredApp: RiderApp = 'onboarding';
}
