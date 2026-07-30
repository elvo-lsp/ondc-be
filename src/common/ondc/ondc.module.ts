import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { CryptoModule } from '../crypto/crypto.module';
import { CallbackService } from './callback.service';
import { SignatureGuard } from './signature.guard';

@Module({
  imports: [HttpModule, CryptoModule],
  providers: [CallbackService, SignatureGuard],
  exports: [CallbackService, SignatureGuard],
})
export class OndcModule {}
