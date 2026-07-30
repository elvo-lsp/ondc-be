import { IsOptional, IsString } from 'class-validator';

// Shared context envelope on every ONDC request/response. See docs/ondc/overview.md.
export class ContextDto {
  @IsString()
  domain!: string;

  @IsString()
  country!: string;

  @IsString()
  city!: string;

  @IsString()
  action!: string;

  @IsString()
  core_version!: string;

  @IsString()
  bap_id!: string;

  @IsString()
  bap_uri!: string;

  @IsOptional()
  @IsString()
  bpp_id?: string;

  @IsOptional()
  @IsString()
  bpp_uri?: string;

  @IsString()
  transaction_id!: string;

  @IsString()
  message_id!: string;

  @IsString()
  timestamp!: string;

  @IsOptional()
  @IsString()
  ttl?: string;
}
