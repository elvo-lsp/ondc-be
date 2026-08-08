import {
  BadRequestException,
  Injectable,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { createReadStream, existsSync } from 'fs';
import { extname, resolve, sep } from 'path';
import { PrismaService } from '../../prisma/prisma.service';
import { AadhaarService } from '../../aadhaar/aadhaar.service';
import { Prisma, RiderStatus, DocumentStatus } from '../../../generated/prisma/client';
import { ListRidersDto } from './dto/list-riders.dto';
import { ApproveRiderDto } from './dto/approve-rider.dto';
import { RejectRiderDto } from './dto/reject-rider.dto';
import { ReviewDocumentDto } from './dto/review-document.dto';

const UPLOAD_ROOT = resolve(process.cwd(), 'uploads', 'rider-documents');

// Allowlist, not a passthrough default: a rider must not be able to pick a
// content type that renders in the admin's browser.
const CONTENT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
};

const DEFAULT_LIMIT = 25;

export interface DocumentFile {
  file: StreamableFile;
  contentType: string;
  filename: string;
}

@Injectable()
export class AdminRidersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aadhaar: AadhaarService,
  ) {}

  async list(partnerId: string, query: ListRidersDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? DEFAULT_LIMIT;

    const where: Prisma.RiderWhereInput = {
      partnerId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.vendorId ? { vendorId: query.vendorId } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
              { phone: { contains: query.search } },
            ],
          }
        : {}),
    };

    const [total, rawRiders] = await Promise.all([
      this.prisma.rider.count({ where }),
      this.prisma.rider.findMany({
        where,
        // FIFO - nobody waits behind newer signups.
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          status: true,
          createdAt: true,
          vendor: { select: { id: true, name: true } },
          _count: {
            select: {
              documents: {
                where: { status: DocumentStatus.REJECTED },
              },
            },
          },
        },
      }),
    ]);

    const riders = rawRiders.map(({ _count, ...rest }) => ({
      ...rest,
      hasRejectedDocs: _count.documents > 0,
    }));

    return { total, page, limit, riders };
  }

  async findOne(partnerId: string, adminId: string, id: string) {
    const rider = await this.prisma.rider.findFirst({
      where: { id, partnerId },
      include: {
        // Ciphertext is needed to decrypt, then stripped before returning.
        profile: { omit: { aadhaarHash: true } },
        vendor: { select: { id: true, name: true } },
        reviewedByAdmin: { select: { id: true, name: true } },
        documents: {
          orderBy: { uploadedAt: 'asc' },
          // filePath omitted - a server-side path the panel must never see.
          select: {
            id: true,
            type: true,
            uploadedAt: true,
            status: true,
            rejectionComment: true,
            reviewedAt: true,
            reviewedByAdmin: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!rider) {
      throw new NotFoundException('Rider not found');
    }

    const { profile, ...rest } = rider;

    if (!profile) {
      return { ...rest, profile: null };
    }

    const { aadhaarCiphertext, ...profileFields } = profile;
    let aadhaarNumber: string | null = null;

    if (aadhaarCiphertext) {
      aadhaarNumber = this.aadhaar.decrypt(aadhaarCiphertext);
      this.aadhaar.logAccess(adminId, rider.id);
    }

    return { ...rest, profile: { ...profileFields, aadhaarNumber } };
  }

  async approve(
    partnerId: string,
    adminId: string,
    riderId: string,
    dto: ApproveRiderDto,
  ) {
    const rider = await this.requireReviewableRider(partnerId, riderId);

    const vendor = await this.prisma.vendor.findFirst({
      where: { id: dto.vendorId, partnerId },
    });

    if (!vendor) {
      throw new NotFoundException('Vendor not found');
    }

    if (!vendor.isActive) {
      throw new BadRequestException(
        'Cannot assign a rider to an inactive vendor',
      );
    }

    // TODO: send the approval email described in docs/rider/onboarding-flow.md -
    // no mail provider is wired up yet.
    return this.prisma.rider.update({
      where: { id: rider.id },
      data: {
        status: RiderStatus.APPROVED,
        vendorId: vendor.id,
        reviewedAt: new Date(),
        reviewedByAdminId: adminId,
      },
      select: { id: true, status: true, vendorId: true, reviewedAt: true },
    });
  }

  async reject(
    partnerId: string,
    adminId: string,
    riderId: string,
    dto: RejectRiderDto,
  ) {
    const rider = await this.requireReviewableRider(partnerId, riderId);

    return this.prisma.rider.update({
      where: { id: rider.id },
      data: {
        status: RiderStatus.REJECTED,
        reviewedAt: new Date(),
        reviewedByAdminId: adminId,
        rejectionReason: dto.reason,
      },
      select: {
        id: true,
        status: true,
        rejectionReason: true,
        reviewedAt: true,
      },
    });
  }

  async reviewDocument(
    partnerId: string,
    adminId: string,
    riderId: string,
    documentId: string,
    dto: ReviewDocumentDto,
  ) {
    // The rider must be UNDER_REVIEW for document-level decisions to make sense.
    const rider = await this.prisma.rider.findFirst({
      where: { id: riderId, partnerId },
    });

    if (!rider) {
      throw new NotFoundException('Rider not found');
    }

    if (rider.status !== RiderStatus.UNDER_REVIEW) {
      throw new BadRequestException(
        `Rider is ${rider.status}; document review is only allowed while the rider is UNDER_REVIEW`,
      );
    }

    if (dto.action === 'reject' && !dto.comment?.trim()) {
      throw new BadRequestException(
        'A rejection comment is required when rejecting a document',
      );
    }

    const document = await this.prisma.riderDocument.findFirst({
      where: { id: documentId, riderId },
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    return this.prisma.riderDocument.update({
      where: { id: documentId },
      data: {
        status:
          dto.action === 'approve'
            ? DocumentStatus.APPROVED
            : DocumentStatus.REJECTED,
        rejectionComment:
          dto.action === 'reject' ? (dto.comment ?? null) : null,
        reviewedAt: new Date(),
        reviewedByAdminId: adminId,
      },
      select: {
        id: true,
        type: true,
        status: true,
        rejectionComment: true,
        reviewedAt: true,
        reviewedByAdmin: { select: { id: true, name: true } },
      },
    });
  }

  async getDocumentFile(
    partnerId: string,
    riderId: string,
    documentId: string,
  ): Promise<DocumentFile> {
    const document = await this.prisma.riderDocument.findFirst({
      where: { id: documentId, riderId, rider: { partnerId } },
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    // filePath is ours, never a client's, but containment keeps a future bug
    // from turning this into an arbitrary file read.
    const absolutePath = resolve(document.filePath);

    if (
      !absolutePath.startsWith(UPLOAD_ROOT + sep) ||
      !existsSync(absolutePath)
    ) {
      throw new NotFoundException('Document file is missing');
    }

    const ext = extname(absolutePath).toLowerCase();
    const contentType = CONTENT_TYPES[ext];

    return {
      file: new StreamableFile(createReadStream(absolutePath)),
      contentType: contentType ?? 'application/octet-stream',
      // Both halves are rider-controlled, so neither reaches the
      // Content-Disposition header unsanitised.
      filename: `${sanitiseName(document.type)}${contentType ? ext : '.bin'}`,
    };
  }

  private async requireReviewableRider(partnerId: string, riderId: string) {
    const rider = await this.prisma.rider.findFirst({
      where: { id: riderId, partnerId },
    });

    if (!rider) {
      throw new NotFoundException('Rider not found');
    }

    if (rider.status !== RiderStatus.UNDER_REVIEW) {
      throw new BadRequestException(
        `Rider is ${rider.status}, only riders under review can be approved or rejected`,
      );
    }

    return rider;
  }
}

function sanitiseName(type: string): string {
  return type.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50) || 'document';
}
