import { Injectable, Logger } from '@nestjs/common';
import { blake2b } from 'blakejs';
import nacl from 'tweetnacl';
import { AppConfigService } from '../../config/app-config.service';
import { RegistryService } from './registry.service';

interface ParsedAuthHeader {
  subscriberId: string;
  ukId: string;
  created: number;
  expires: number;
  signature: string;
}

function parseAuthorizationHeader(header: string): ParsedAuthHeader {
  const params: Record<string, string> = {};
  const pairPattern = /(\w+)="([^"]*)"/g;
  let match: RegExpExecArray | null;
  while ((match = pairPattern.exec(header))) {
    params[match[1]] = match[2];
  }

  const [subscriberId, ukId] = (params.keyId ?? '').split('|');
  if (
    !subscriberId ||
    !ukId ||
    !params.created ||
    !params.expires ||
    !params.signature
  ) {
    throw new Error('Malformed Authorization header');
  }

  return {
    subscriberId,
    ukId,
    created: Number(params.created),
    expires: Number(params.expires),
    signature: params.signature,
  };
}

// Implements docs/ondc/auth.md signing + verification. verify() fails closed on any
// ambiguity (malformed header, expired signature, unknown subscriber, bad signature) -
// callers (SignatureGuard) must turn a `false` into HTTP 401, never proceed anyway.
@Injectable()
export class SigningService {
  private readonly logger = new Logger(SigningService.name);

  constructor(
    private readonly config: AppConfigService,
    private readonly registry: RegistryService,
  ) {}

  private blake2bBase64(bytes: Buffer): string {
    return Buffer.from(blake2b(bytes, undefined, 64)).toString('base64');
  }

  /** Base64 Blake2b-512 digest of a JSON payload (outbound signing only). */
  digestBase64(payload: unknown): string {
    return this.blake2bBase64(Buffer.from(JSON.stringify(payload), 'utf-8'));
  }

  /** Builds the `Authorization` header value for an outbound request/callback. */
  buildAuthorizationHeader(payload: unknown): string {
    const created = Math.floor(Date.now() / 1000);
    const expires = created + 30;
    const digest = this.digestBase64(payload);
    const signingString = `(created): ${created}\n(expires): ${expires}\ndigest: BLAKE-512=${digest}`;

    const secretKey = Buffer.from(this.config.signingPrivateKey, 'base64');
    const signature = nacl.sign.detached(
      Buffer.from(signingString, 'utf-8'),
      secretKey,
    );
    const signatureBase64 = Buffer.from(signature).toString('base64');

    const keyId = `${this.config.subscriberId}|${this.config.ukId}|ed25519`;
    return (
      `Signature keyId="${keyId}",algorithm="ed25519",created="${created}",` +
      `expires="${expires}",headers="(created) (expires) digest",signature="${signatureBase64}"`
    );
  }

  /**
   * Verifies an inbound request. Must be given the RAW request bytes (not a re-serialized
   * JS object) - the digest has to match exactly what the sender signed. See
   * docs/ondc/auth.md "Verifying an inbound request".
   */
  async verify(
    rawBody: Buffer,
    authorizationHeader: string | undefined,
  ): Promise<boolean> {
    if (!authorizationHeader) return false;

    let parsed: ParsedAuthHeader;
    try {
      parsed = parseAuthorizationHeader(authorizationHeader);
    } catch {
      this.logger.warn('Rejected request: malformed Authorization header');
      return false;
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    if (parsed.expires < nowSeconds) {
      this.logger.warn(
        `Rejected request: signature expired (expires=${parsed.expires}, now=${nowSeconds})`,
      );
      return false;
    }

    let publicKeyBase64: string;
    try {
      publicKeyBase64 = await this.registry.getSigningPublicKey(
        parsed.subscriberId,
        parsed.ukId,
      );
    } catch (err) {
      this.logger.warn(
        `Rejected request: could not resolve signing key for ${parsed.subscriberId}/${parsed.ukId}: ${(err as Error).message}`,
      );
      return false;
    }

    const digest = this.blake2bBase64(rawBody);
    const signingString = `(created): ${parsed.created}\n(expires): ${parsed.expires}\ndigest: BLAKE-512=${digest}`;

    try {
      const publicKey = Buffer.from(publicKeyBase64, 'base64');
      const signature = Buffer.from(parsed.signature, 'base64');
      const ok = nacl.sign.detached.verify(
        Buffer.from(signingString, 'utf-8'),
        signature,
        publicKey,
      );
      if (!ok)
        this.logger.warn(
          `Rejected request: signature mismatch for ${parsed.subscriberId}`,
        );
      return ok;
    } catch {
      return false;
    }
  }
}
