import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { lastValueFrom } from 'rxjs';
import { AppConfigService } from '../../config/app-config.service';

interface RegistryLookupEntry {
  ukId: string;
  status: string;
  signing_public_key: string;
}

interface CacheEntry {
  publicKey: string;
  expiresAt: number;
}

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour, same trade-off as JWKS caching

// Cached registry /lookup client for verifying inbound signatures. See docs/ondc/auth.md.
// Fails closed: an unreachable registry or unknown subscriber throws - callers (SigningService
// -> SignatureGuard) must treat that as "reject the request", never "allow it through".
@Injectable()
export class RegistryService {
  private readonly logger = new Logger(RegistryService.name);
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly http: HttpService,
    private readonly config: AppConfigService,
  ) {}

  async getSigningPublicKey(
    subscriberId: string,
    ukId: string,
  ): Promise<string> {
    const cacheKey = `${subscriberId}:${ukId}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.publicKey;
    }

    const publicKey = await this.resolvePublicKey(subscriberId, ukId);
    this.cache.set(cacheKey, {
      publicKey,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });
    return publicKey;
  }

  private async resolvePublicKey(
    subscriberId: string,
    ukId: string,
  ): Promise<string> {
    try {
      return await this.lookupFromRegistry(subscriberId, ukId);
    } catch (err) {
      // Dev-only: lets local testing exercise the real verify() crypto path against a
      // throwaway keypair, without a reachable registry. Structurally can't hit prod - see
      // AppConfigService#isProd.
      if (!this.config.isProd) {
        const devKey = this.tryDevFallback(subscriberId);
        if (devKey) {
          this.logger.warn(
            `[dev-only] Using DEV_TRUSTED_SUBSCRIBER_PUBLIC_KEY fallback for ${subscriberId} ` +
              `(registry lookup failed: ${(err as Error).message})`,
          );
          return devKey;
        }
      }
      throw err;
    }
  }

  private tryDevFallback(subscriberId: string): string | null {
    if (
      this.config.devTrustedSubscriberId === subscriberId &&
      this.config.devTrustedSubscriberPublicKey
    ) {
      return this.config.devTrustedSubscriberPublicKey;
    }
    return null;
  }

  private async lookupFromRegistry(
    subscriberId: string,
    ukId: string,
  ): Promise<string> {
    if (!this.config.registryUrl) {
      throw new Error('REGISTRY_URL not configured');
    }
    const url = `${this.config.registryUrl.replace(/\/$/, '')}/lookup`;

    const response = await lastValueFrom(
      this.http.post<RegistryLookupEntry[]>(
        url,
        { subscriber_id: subscriberId, ukId },
        { timeout: 5000 },
      ),
    );

    const match = response.data.find(
      (entry) => entry.ukId === ukId && entry.status === 'SUBSCRIBED',
    );
    if (!match) {
      throw new Error(
        `No SUBSCRIBED registry entry for ${subscriberId}/${ukId}`,
      );
    }
    return match.signing_public_key;
  }
}
