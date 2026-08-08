import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  currentDocumentsByType,
  documentsAreComplete,
  outstandingDocumentTypes,
  RequiredDocumentType,
} from './required-documents';

/**
 * The one piece of document logic both rider surfaces share.
 * `RiderProfile.documentsCompletedAt` has two writers - the rider by uploading,
 * an admin by reviewing - so the recompute lives here rather than drifting
 * between the two write sites.
 */
@Injectable()
export class RiderDocumentsService {
  constructor(private readonly prisma: PrismaService) {}

  /** The live upload per type; superseded rows are history, not current state. */
  async listCurrent(riderId: string) {
    const documents = await this.prisma.riderDocument.findMany({
      where: { riderId, supersededAt: null },
      // filePath omitted - a server-side path no client should ever see.
      select: {
        id: true,
        type: true,
        status: true,
        rejectionComment: true,
        uploadedAt: true,
        reviewedAt: true,
        supersededAt: true,
      },
    });

    return [...currentDocumentsByType(documents).values()]
      .sort((a, b) => a.uploadedAt.getTime() - b.uploadedAt.getTime())
      .map((document) => ({
        id: document.id,
        type: document.type,
        status: document.status,
        rejectionComment: document.rejectionComment,
        uploadedAt: document.uploadedAt,
        reviewedAt: document.reviewedAt,
      }));
  }

  async outstandingFor(riderId: string): Promise<RequiredDocumentType[]> {
    return outstandingDocumentTypes(await this.completenessRows(riderId));
  }

  /**
   * Recomputes `documentsCompletedAt` and returns whether documents are complete.
   * Two-way: an admin's rejection makes a complete rider incomplete again, and the
   * flag has to follow or the rider app keeps showing their documents as done.
   *
   * Writes unconditionally. Reading the flag first and skipping when it matched
   * was a lost update: with a rider uploading and an admin rejecting at once, one
   * caller could see a value that made its own write look redundant and skip it.
   */
  async syncCompletion(riderId: string): Promise<boolean> {
    const complete = documentsAreComplete(await this.completenessRows(riderId));

    if (complete) {
      await this.prisma.riderProfile.upsert({
        where: { riderId },
        create: { riderId, documentsCompletedAt: new Date() },
        update: { documentsCompletedAt: new Date() },
      });
    } else {
      // updateMany, so a rider with no profile row yet is a no-op not an error.
      await this.prisma.riderProfile.updateMany({
        where: { riderId },
        data: { documentsCompletedAt: null },
      });
    }

    return complete;
  }

  private completenessRows(riderId: string) {
    return this.prisma.riderDocument.findMany({
      where: { riderId },
      select: {
        id: true,
        type: true,
        status: true,
        supersededAt: true,
        uploadedAt: true,
      },
    });
  }
}
