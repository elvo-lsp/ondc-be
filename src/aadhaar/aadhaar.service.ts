import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from 'crypto';

const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

/**
 * Ciphertext so an admin can read the number back when checking it against the
 * uploaded scan; an HMAC because you cannot query ciphertext and duplicate
 * detection needs equality. See docs/infra/aadhaar.md.
 */
@Injectable()
export class AadhaarService {
  private readonly logger = new Logger(AadhaarService.name);
  private readonly key: Buffer;
  private readonly pepper: Buffer;

  constructor(config: ConfigService) {
    this.key = Buffer.from(
      config.getOrThrow<string>('AADHAAR_ENCRYPTION_KEY'),
      'hex',
    );
    this.pepper = Buffer.from(
      config.getOrThrow<string>('AADHAAR_HASH_PEPPER'),
      'utf8',
    );

    if (this.key.length !== 32) {
      throw new Error(
        'AADHAAR_ENCRYPTION_KEY must be 32 bytes (64 hex chars) for AES-256-GCM',
      );
    }
  }

  encrypt(aadhaarNumber: string): Uint8Array<ArrayBuffer> {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(aadhaarNumber, 'utf8'),
      cipher.final(),
    ]);

    // iv || authTag || ciphertext, so the whole thing round-trips as one column.
    return new Uint8Array(Buffer.concat([iv, cipher.getAuthTag(), ciphertext]));
  }

  decrypt(stored: Uint8Array): string {
    const buf = Buffer.from(stored);
    const iv = buf.subarray(0, IV_LENGTH);
    const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString('utf8');
  }

  /** Stable per-number, so it can carry a unique index for duplicate detection. */
  hash(aadhaarNumber: string): string {
    return createHmac('sha256', this.pepper)
      .update(aadhaarNumber)
      .digest('hex');
  }

  last4(aadhaarNumber: string): string {
    return aadhaarNumber.slice(-4);
  }

  /** UIDAI expects retrieval to be traceable. A log line is the minimum. */
  logAccess(adminId: string, riderId: string): void {
    this.logger.log(
      `Aadhaar number read: admin=${adminId} rider=${riderId} at=${new Date().toISOString()}`,
    );
  }
}
