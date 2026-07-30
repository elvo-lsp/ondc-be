import { InjectQueue } from '@nestjs/bullmq';
import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Queue } from 'bullmq';
import { buildAck, buildNack } from '../../common/ondc/ack';
import { SignatureGuard } from '../../common/ondc/signature.guard';
import { SEARCH_QUEUE } from '../../queue/queue.module';
import { SearchRequestDto } from './dto/search-request.dto';
import { SearchJobData } from './search.processor';
import { SearchService } from './search.service';

@Controller()
@UseGuards(SignatureGuard)
export class SearchController {
  constructor(
    private readonly searchService: SearchService,
    @InjectQueue(SEARCH_QUEUE) private readonly queue: Queue<SearchJobData>,
  ) {}

  @Post('search')
  async search(@Body() body: SearchRequestDto) {
    const validationError = this.searchService.validateRequest(body);
    if (validationError) {
      return buildNack(validationError.code, validationError.message);
    }

    // Zero DB I/O before ACK - one Redis round-trip. jobId gives free first-layer dedup
    // for retries still in flight; the authoritative check (Postgres unique constraint)
    // lives in SearchProcessor, off the critical path. See docs/ondc/search.md.
    const jobId = `${body.context.bap_id}:${body.context.transaction_id}:${body.context.message_id}`;
    await this.queue.add('process-search', { body }, { jobId });

    return buildAck();
  }
}
