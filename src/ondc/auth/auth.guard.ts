import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from './auth.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context
      .switchToHttp()
      .getRequest<Request & { rawBody?: Buffer }>();
    const authHeader = req.headers['authorization'];

    if (!authHeader) {
      throw new UnauthorizedException('Missing Authorization header');
    }

    if (!req.rawBody) {
      throw new Error(
        'req.rawBody is undefined - rawBody must be enabled in NestFactory.create() in main.ts',
      );
    }

    await this.authService.verifyRequest(
      authHeader,
      req.rawBody.toString('utf-8'),
    );

    return true;
  }
}
