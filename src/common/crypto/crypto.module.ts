import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { RegistryService } from './registry.service';
import { SigningService } from './signing.service';

@Module({
  imports: [HttpModule],
  providers: [SigningService, RegistryService],
  exports: [SigningService, RegistryService],
})
export class CryptoModule {}
