import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { OndcModule } from './ondc/ondc.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), OndcModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
