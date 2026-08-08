import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma, RiderStatus } from '../../../generated/prisma/client';
import { AadhaarService } from '../../aadhaar/aadhaar.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class RiderProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aadhaar: AadhaarService,
  ) {}

  async updateProfile(riderId: string, dto: UpdateProfileDto) {
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

  async uploadDocument(riderId: string, type: string, filePath: string) {
    await this.prisma.riderDocument.create({
      data: { riderId, type, filePath },
    });

    const docs = await this.prisma.riderDocument.findMany({
      where: { riderId },
      select: { type: true },
    });

    const uploadedTypes = new Set(docs.map((d) => d.type));
    const hasAllRequired =
      uploadedTypes.has('AADHAAR') &&
      uploadedTypes.has('PAN') &&
      uploadedTypes.has('DRIVING_LICENSE');

    if (hasAllRequired) {
      const profile = await this.prisma.riderProfile.findUnique({
        where: { riderId },
      });

      if (!profile?.documentsCompletedAt) {
        await this.prisma.riderProfile.upsert({
          where: { riderId },
          create: { riderId, documentsCompletedAt: new Date() },
          update: { documentsCompletedAt: new Date() },
        });
      }

      await this.maybeMoveToUnderReview(riderId);
    }

    return { message: 'Document uploaded' };
  }

  async getStatus(riderId: string) {
    const rider = await this.prisma.rider.findUnique({
      where: { id: riderId },
      include: { 
        profile: true,
        documents: { select: { type: true } }
      },
    });

    if (!rider) {
      throw new NotFoundException('Rider not found');
    }

    return {
      name: rider.name,
      email: rider.email,
      phone: rider.phone,
      status: rider.status,
      profileCompleted: !!rider.profile?.profileCompletedAt,
      documentsCompleted: !!rider.profile?.documentsCompletedAt,
      uploadedDocuments: rider.documents.map(d => d.type),
    };
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
