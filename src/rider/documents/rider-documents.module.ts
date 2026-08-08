import { Module } from '@nestjs/common';
import { RiderDocumentsService } from './rider-documents.service';

/**
 * Small on purpose: it exists only because `documentsCompletedAt` has a writer on
 * each surface, so both `rider/profile` and `admin/riders` import it.
 * See docs/admin/README.md.
 */
@Module({
  providers: [RiderDocumentsService],
  exports: [RiderDocumentsService],
})
export class RiderDocumentsModule {}
