import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  DocumentStatus,
  Prisma,
  RiderStatus,
} from '../../../generated/prisma/client';
import { AadhaarService } from '../../aadhaar/aadhaar.service';
import { RiderDocumentsService } from '../documents/rider-documents.service';
import { REQUIRED_DOCUMENT_TYPES } from '../documents/required-documents';
import { UpdateProfileDto } from './dto/update-profile.dto';

/**
 * `APPROVED` is excluded so the documents behind an approval cannot move under it;
 * `REJECTED` because a rider-level rejection is terminal.
 */
const EDITABLE_STATUSES: RiderStatus[] = [
  RiderStatus.PROFILE_PENDING,
  RiderStatus.UNDER_REVIEW,
];

@Injectable()
export class RiderProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aadhaar: AadhaarService,
    private readonly documents: RiderDocumentsService,
  ) {}

  async updateProfile(riderId: string, dto: UpdateProfileDto) {
    await this.requireEditableRider(riderId);

    const fields = {
      dateOfBirth: new Date(dto.dateOfBirth),
      temporaryAddress: dto.temporaryAddress,
      permanentAddress: dto.permanentAddress,
      aadhaarCiphertext: this.aadhaar.encrypt(dto.aadharNumber),
      aadhaarHash: this.aadhaar.hash(dto.aadharNumber),
      aadhaarLast4: this.aadhaar.last4(dto.aadharNumber),
      profileCompletedAt: new Date(),
    };

    try {
      await this.prisma.riderProfile.upsert({
        where: { riderId },
        create: { riderId, ...fields },
        update: fields,
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        // aadhaarHash is unique, so this is another rider having already
        // registered the same Aadhaar number.
        throw new ConflictException(
          'This Aadhaar number is already registered to another rider',
        );
      }
      throw err;
    }

    await this.maybeMoveToUnderReview(riderId);

    return { message: 'Profile updated' };
  }

  /**
   * Never overwrites: inserts a new row and retires the previous live upload,
   * so an admin can still see what was rejected and what replaced it.
   */
  async uploadDocument(riderId: string, type: string, filePath: string) {
    await this.requireEditableRider(riderId);

    await this.prisma.$transaction(async (tx) => {
      const created = await tx.riderDocument.create({
        data: { riderId, type, filePath },
      });

      // updateMany, not update-the-row-we-read: retires *every* live row of this
      // type with no read to go stale, so concurrent uploads cannot strand a live
      // row that nothing will ever supersede.
      await tx.riderDocument.updateMany({
        where: {
          riderId,
          type,
          supersededAt: null,
          id: { not: created.id },
          status: { not: DocumentStatus.APPROVED },
        },
        data: { supersededAt: new Date(), supersededById: created.id },
      });

      // Checked after the write and inside the transaction, so it rolls back.
      // Checking first would be a read a concurrent approval could invalidate.
      const approvedStillLive = await tx.riderDocument.count({
        where: {
          riderId,
          type,
          supersededAt: null,
          id: { not: created.id },
          status: DocumentStatus.APPROVED,
        },
      });

      if (approvedStillLive > 0) {
        throw new BadRequestException(
          'This document has already been approved and cannot be replaced',
        );
      }
    });

    await this.documents.syncCompletion(riderId);
    await this.maybeMoveToUnderReview(riderId);

    return { message: 'Document uploaded' };
  }

  /**
   * Backs the onboarding app's home screen. Per-document status is included
   * because a rejected document is the rider's cue to re-upload it - unlike
   * `Rider.rejectionReason`, which is rider-level and stays admin-only.
   */
  async getStatus(riderId: string) {
    const rider = await this.prisma.rider.findUnique({
      where: { id: riderId },
      include: { profile: { select: { profileCompletedAt: true } } },
    });

    if (!rider) {
      throw new NotFoundException('Rider not found');
    }

    const [documents, outstandingDocuments] = await Promise.all([
      this.documents.listCurrent(riderId),
      this.documents.outstandingFor(riderId),
    ]);

    return {
      name: rider.name,
      email: rider.email,
      phone: rider.phone,
      status: rider.status,
      profileCompleted: !!rider.profile?.profileCompletedAt,
      documentsCompleted: outstandingDocuments.length === 0,
      canEdit: EDITABLE_STATUSES.includes(rider.status),
      requiredDocuments: [...REQUIRED_DOCUMENT_TYPES],
      outstandingDocuments,
      documents,
    };
  }

  private async requireEditableRider(riderId: string) {
    const rider = await this.prisma.rider.findUnique({
      where: { id: riderId },
      select: { id: true, status: true },
    });

    if (!rider) {
      throw new NotFoundException('Rider not found');
    }

    if (!EDITABLE_STATUSES.includes(rider.status)) {
      throw new BadRequestException(
        `Your application is ${rider.status} and can no longer be changed`,
      );
    }

    return rider;
  }

  private async maybeMoveToUnderReview(riderId: string): Promise<void> {
    const rider = await this.prisma.rider.findUniqueOrThrow({
      where: { id: riderId },
      include: { profile: true },
    });

    if (
      rider.status === RiderStatus.PROFILE_PENDING &&
      rider.profile?.profileCompletedAt &&
      rider.profile?.documentsCompletedAt
    ) {
      await this.prisma.rider.update({
        where: { id: riderId },
        data: { status: RiderStatus.UNDER_REVIEW },
      });
    }
  }
}
