import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsPhoneNumber,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { VendorContactDto } from './vendor-contact.dto';

export class CreateVendorDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  /** Business-assigned reference, e.g. an internal store code. Unique per partner when set. */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  contactName?: string;

  @IsOptional()
  @IsPhoneNumber('IN')
  contactPhone?: string;

  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  /** The brand this vendor belongs to, e.g. Burger King. Omit for an independent vendor. */
  @IsOptional()
  @IsUUID()
  chainId?: string;

  /** Required together with longitude - see AdminVendorsService.resolveGeofence. */
  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @IsOptional()
  @IsLongitude()
  longitude?: number;

  /** Only meaningful once a location is set; defaults to DEFAULT_GEOFENCE_RADIUS_METERS. */
  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(5000)
  geofenceRadiusMeters?: number;

  @IsOptional()
  @IsBoolean()
  needsRiders?: boolean;

  @IsOptional()
  @IsBoolean()
  needsVehicles?: boolean;

  /** Replaces the vendor's full contact list on write - see AdminVendorsService. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => VendorContactDto)
  contacts?: VendorContactDto[];
}
