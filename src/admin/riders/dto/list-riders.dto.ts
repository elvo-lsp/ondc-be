import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { RiderStatus } from '../../../../generated/prisma/client';

export class ListRidersDto {
  @IsOptional()
  @IsEnum(RiderStatus)
  status?: RiderStatus;

  @IsOptional()
  @IsUUID()
  vendorId?: string;

  /** Matches name, email or phone. */
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
