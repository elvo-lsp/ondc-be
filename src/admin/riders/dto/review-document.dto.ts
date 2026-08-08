import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class ReviewDocumentDto {
  @IsIn(['approve', 'reject'])
  action: 'approve' | 'reject';

  /** Required when action is "reject". */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  comment?: string;
}
