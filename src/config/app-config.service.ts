import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AppConfigService {
  constructor(private readonly config: ConfigService) {}

  get port(): number {
    return Number(this.config.get('PORT') ?? 3000);
  }

  get databaseUrl(): string {
    return this.config.getOrThrow<string>('DATABASE_URL');
  }

  get redisUrl(): string {
    return this.config.getOrThrow<string>('REDIS_URL');
  }

  get subscriberId(): string {
    return this.config.getOrThrow<string>('SUBSCRIBER_ID');
  }

  get subscriberUrl(): string {
    return this.config.getOrThrow<string>('SUBSCRIBER_URL');
  }

  get ukId(): string {
    return this.config.getOrThrow<string>('UK_ID');
  }

  get signingPrivateKey(): string {
    return this.config.get<string>('SIGNING_PRIVATE_KEY') ?? '';
  }

  get signingPublicKey(): string {
    return this.config.get<string>('SIGNING_PUBLIC_KEY') ?? '';
  }

  get registryUrl(): string {
    return this.config.get<string>('REGISTRY_URL') ?? '';
  }

  get ondcEnvironment(): string {
    return this.config.get<string>('ONDC_ENVIRONMENT') ?? 'staging';
  }

  get isProd(): boolean {
    return (
      this.ondcEnvironment === 'prod' || this.ondcEnvironment === 'production'
    );
  }

  /** Dev-only registry fallback so local signature verification can be tested end-to-end
   * without a reachable ONDC registry. See docs/ondc/auth.md. Never consulted when isProd. */
  get devTrustedSubscriberId(): string | undefined {
    return this.config.get<string>('DEV_TRUSTED_SUBSCRIBER_ID') || undefined;
  }

  get devTrustedSubscriberPublicKey(): string | undefined {
    return (
      this.config.get<string>('DEV_TRUSTED_SUBSCRIBER_PUBLIC_KEY') || undefined
    );
  }
}
