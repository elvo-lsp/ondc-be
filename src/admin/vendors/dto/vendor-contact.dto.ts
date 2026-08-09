import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class VendorContactDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  designation?: string;
}
