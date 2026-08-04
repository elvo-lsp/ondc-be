import { PartialType } from '@nestjs/mapped-types';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateVendorDto } from './create-vendor.dto';

export class UpdateVendorDto extends PartialType(CreateVendorDto) {
  // Stands in for delete, which approved riders' FKs rule out. Only blocks
  // new assignments.
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
