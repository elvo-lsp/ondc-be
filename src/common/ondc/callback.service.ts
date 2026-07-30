import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { lastValueFrom } from 'rxjs';
import { SigningService } from '../crypto/signing.service';

interface OndcCallbackPayload {
  context: { bap_uri: string; action: string };
  message: unknown;
}

// Sends a signed callback (e.g. /on_search) to a buyer NP. See docs/ondc/overview.md
// for the async request -> ACK -> callback pattern this implements.
@Injectable()
export class CallbackService {
  private readonly logger = new Logger(CallbackService.name);

  constructor(
    private readonly http: HttpService,
    private readonly signing: SigningService,
  ) {}

  async send(payload: OndcCallbackPayload): Promise<void> {
    const url = `${payload.context.bap_uri.replace(/\/$/, '')}/${payload.context.action}`;
    const authorization = this.signing.buildAuthorizationHeader(payload);

    await lastValueFrom(
      this.http.post(url, payload, {
        headers: {
          Authorization: authorization,
          'Content-Type': 'application/json',
        },
        timeout: 5000,
      }),
    );
    this.logger.log(`Sent ${payload.context.action} -> ${url}`);
  }
}
