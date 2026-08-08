import { IsIn } from 'class-validator';
import { REQUIRED_DOCUMENT_TYPES } from '../../documents/required-documents';
// `import type` because it appears in a decorated signature - emitDecoratorMetadata
// would otherwise emit a runtime import for a type-only symbol.
import type { RequiredDocumentType } from '../../documents/required-documents';

export class UploadDocumentDto {
  // An allowlist is both the domain rule and a stronger version of the character
  // constraint it replaced: `type` reaches a Content-Disposition header on the
  // admin side. That read path still sanitises, for rows written before this.
  @IsIn(REQUIRED_DOCUMENT_TYPES, {
    message: `type must be one of: ${REQUIRED_DOCUMENT_TYPES.join(', ')}`,
  })
  type: RequiredDocumentType;
}
