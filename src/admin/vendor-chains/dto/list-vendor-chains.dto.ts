import { IsOptional, IsString } from 'class-validator';

export class ListVendorChainsDto {
  @IsOptional()
  @IsString()
  search?: string;
}
