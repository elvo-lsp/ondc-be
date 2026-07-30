import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { AppConfigService } from './app-config.service';
import { validate } from './env.validation';

@Global()
@Module({
  imports: [NestConfigModule.forRoot({ isGlobal: true, validate })],
  providers: [AppConfigService],
  exports: [AppConfigService],
})
export class ConfigModule {}
