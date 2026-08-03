import { Injectable, Logger } from '@nestjs/common';
import { SearchRequestDto } from './dto/search-request.dto';

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  async handleSearch(request: SearchRequestDto): Promise<void> {
    this.logger.log(
      `Received search intent, transaction_id=${request.context.transaction_id}`,
    );

    // TODO: build the catalog response from request.message.intent
    // TODO: sign and send it back as /on_search to request.context.bap_uri
  }
}
