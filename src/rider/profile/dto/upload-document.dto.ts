import { IsString, MinLength } from 'class-validator';

export class UploadDocumentDto {
  @IsString()
  @MinLength(1)
  type: string;
}
