import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from './config/config.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { QueueModule } from './queue/queue.module';
import { SearchModule } from './modules/search/search.module';

@Module({
  imports: [ConfigModule, PrismaModule, QueueModule, SearchModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
