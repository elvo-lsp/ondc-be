import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { AppConfigService } from '../../config/app-config.service';
import { toJson } from '../../common/json';
import { CallbackService } from '../../common/ondc/callback.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SEARCH_QUEUE } from '../../queue/queue.module';
import { SearchRequestDto } from './dto/search-request.dto';
import { SearchService } from './search.service';

export interface SearchJobData {
  body: SearchRequestDto;
}

// Worker side of the /search -> /on_search flow. See docs/ondc/search.md flowchart.
// Owns the SearchLog's whole lifecycle: create (doubling as the dedup check) -> update
// to its final status. Everything here runs off the critical path - the controller has
// already ACKed by the time this executes.
@Processor(SEARCH_QUEUE)
export class SearchProcessor extends WorkerHost {
  private readonly logger = new Logger(SearchProcessor.name);

  constructor(
    private readonly searchService: SearchService,
    private readonly callback: CallbackService,
    private readonly config: AppConfigService,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async process(job: Job<SearchJobData>): Promise<void> {
    const { body } = job.data;

    const log = await this.searchService.recordReceived(body);
    if (!log) {
      // jobId dedup in the controller only covers jobs still in the queue; this catches
      // retries that arrive after the original job already completed.
      this.logger.log(
        `Duplicate /search for ${body.context.transaction_id}/${body.context.message_id} - already processed, skipping`,
      );
      return;
    }

    const intent = body.message.intent;
    const startArea = intent.fulfillment!.start!.location!.address!.area_code!;
    const endArea = intent.fulfillment!.end!.location!.address!.area_code!;
    const categoryId = intent.category!.id!;

    const { providerId, categories } =
      await this.searchService.findServiceableCategories(
        startArea,
        endArea,
        categoryId,
      );

    if (!providerId || categories.length === 0) {
      this.logger.log(
        `No serviceable match for ${categoryId} ${startArea}->${endArea}, not responding`,
      );
      await this.prisma.searchLog.update({
        where: { id: log.id },
        data: { status: 'NO_MATCH' },
      });
      return;
    }

    const catalog = await this.searchService.buildCatalog(
      providerId,
      categories,
    );
    const responsePayload = {
      context: {
        ...body.context,
        action: 'on_search',
        bpp_id: this.config.subscriberId,
        bpp_uri: this.config.subscriberUrl,
        timestamp: new Date().toISOString(),
      },
      message: { catalog },
    };

    try {
      await this.callback.send(responsePayload);
      await this.prisma.searchLog.update({
        where: { id: log.id },
        data: { status: 'SENT', responsePayload: toJson(responsePayload) },
      });
    } catch (err) {
      await this.prisma.searchLog.update({
        where: { id: log.id },
        data: { status: 'FAILED', responsePayload: toJson(responsePayload) },
      });
      throw err; // let BullMQ apply its retry policy (see search.module.ts defaultJobOptions)
    }
  }
}
