import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { SigningService } from '../crypto/signing.service';
import { RawBodyRequest } from '../http/raw-body';

// Enforces docs/ondc/auth.md "Verifying an inbound request" - HTTP 401 on any failure
// to verify (missing/malformed/expired/forged signature, unknown subscriber). Apply
// explicitly per ONDC action controller (@UseGuards(SignatureGuard)), not globally -
// a global guard would also block plain infra routes like GET /.
@Injectable()
export class SignatureGuard implements CanActivate {
  constructor(private readonly signing: SigningService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RawBodyRequest>();

    if (!req.rawBody) {
      throw new UnauthorizedException('Invalid or missing request signature');
    }

    const authHeader = req.headers['authorization'];
    const valid = await this.signing.verify(req.rawBody, authHeader);
    if (!valid) {
      throw new UnauthorizedException('Invalid or missing request signature');
    }
    return true;
  }
}
