import { Module } from '@nestjs/common';
import { AadhaarService } from './aadhaar.service';

@Module({
  providers: [AadhaarService],
  exports: [AadhaarService],
})
export class AadhaarModule {}
