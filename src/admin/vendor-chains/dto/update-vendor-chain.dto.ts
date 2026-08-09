import { PartialType } from '@nestjs/mapped-types';
import { CreateVendorChainDto } from './create-vendor-chain.dto';

export class UpdateVendorChainDto extends PartialType(CreateVendorChainDto) {}
