import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { CryptoModule } from '../../common/crypto/crypto.module';
import { OndcModule } from '../../common/ondc/ondc.module';
import { SEARCH_QUEUE } from '../../queue/queue.module';
import { SearchController } from './search.controller';
import { SearchProcessor } from './search.processor';
import { SearchService } from './search.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: SEARCH_QUEUE,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        // Bound Redis memory growth under sustained traffic - keep a bounded history
        // instead of retaining every job forever.
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 1000 },
      },
    }),
    OndcModule,
    CryptoModule,
  ],
  controllers: [SearchController],
  providers: [SearchService, SearchProcessor],
})
export class SearchModule {}
