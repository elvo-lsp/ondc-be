import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { SearchModule } from './search/search.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), AuthModule, SearchModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
