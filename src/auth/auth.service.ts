import { Injectable, UnauthorizedException } from '@nestjs/common';
import { isHeaderValid } from 'ondc-crypto-sdk-nodejs';
import { RegistryService } from './registry.service';

@Injectable()
export class AuthService {
  constructor(private readonly registryService: RegistryService) {}

  async verifyRequest(authHeader: string, rawBody: string): Promise<void> {
    const { subscriberId, ukId, expires } = this.parseAuthHeader(authHeader);

    // ondc-crypto-sdk-nodejs verifies the signature but never checks `expires`
    // itself - an otherwise-valid signature on a stale request would pass.
    if (expires && Number(expires) * 1000 < Date.now()) {
      throw new UnauthorizedException('Signature has expired');
    }

    const registryEntry = await this.registryService.lookup(subscriberId, ukId);

    if (registryEntry.status !== 'SUBSCRIBED') {
      throw new UnauthorizedException(
        `Subscriber "${subscriberId}" is not in SUBSCRIBED status`,
      );
    }

    const now = Date.now();
    if (
      now < Date.parse(registryEntry.valid_from) ||
      now > Date.parse(registryEntry.valid_until)
    ) {
      throw new UnauthorizedException(
        `Registry key for "${subscriberId}" is outside its validity window`,
      );
    }

    const isValid = await isHeaderValid({
      header: authHeader,
      body: rawBody,
      publicKey: registryEntry.signing_public_key,
    });

    if (!isValid) {
      throw new UnauthorizedException('Signature verification failed');
    }
  }

  private parseAuthHeader(authHeader: string) {
    const keyIdMatch = authHeader.match(/keyId="([^"]+)"/);
    const expiresMatch = authHeader.match(/expires="([^"]+)"/);

    if (!keyIdMatch) {
      throw new UnauthorizedException('Malformed Authorization header: missing keyId');
    }

    const [subscriberId, ukId] = keyIdMatch[1].split('|');

    if (!subscriberId || !ukId) {
      throw new UnauthorizedException(
        'Malformed keyId: expected "subscriberId|ukId|algorithm"',
      );
    }

    return { subscriberId, ukId, expires: expiresMatch?.[1] };
  }
}
