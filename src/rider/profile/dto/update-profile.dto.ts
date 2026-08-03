import { IsDateString, IsString, MinLength } from 'class-validator';

export class UpdateProfileDto {
  @IsDateString()
  dateOfBirth: string;

  @IsString()
  @MinLength(1)
  temporaryAddress: string;

  @IsString()
  @MinLength(1)
  permanentAddress: string;

  @IsString()
  @MinLength(1)
  aadharNumber: string;
}
