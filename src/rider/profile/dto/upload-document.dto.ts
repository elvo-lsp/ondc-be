import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class UploadDocumentDto {
  // Reaches a Content-Disposition header on the admin side, where a quote or
  // newline breaks the response. Still free-form pending a document list.
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  @Matches(/^[A-Za-z0-9 _-]+$/, {
    message:
      'type may only contain letters, numbers, spaces, hyphens and underscores',
  })
  type: string;
}
