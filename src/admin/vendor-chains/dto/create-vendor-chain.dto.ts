import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateVendorChainDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;
}
