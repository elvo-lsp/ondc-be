import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { RegistryEntry } from './registry-entry.interface';

@Injectable()
export class RegistryService {
  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async lookup(subscriberId: string, ukId: string): Promise<RegistryEntry> {
    const registryUrl = this.configService.get<string>('ONDC_REGISTRY_URL');
    const domain = this.configService.get<string>('ONDC_DOMAIN');

    const response = await firstValueFrom(
      this.httpService.post<RegistryEntry[]>(`${registryUrl}/lookup`, {
        subscriber_id: subscriberId,
        ukId,
        domain,
      }),
    );

    const [entry] = response.data;

    if (!entry) {
      throw new UnauthorizedException(
        `No registry entry found for subscriber "${subscriberId}" / ukId "${ukId}"`,
      );
    }

    return entry;
  }
}
