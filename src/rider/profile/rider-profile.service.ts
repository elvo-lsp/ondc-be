import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RiderStatus } from '../../../generated/prisma/client';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class RiderProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async updateProfile(riderId: string, dto: UpdateProfileDto) {
    await this.prisma.riderProfile.upsert({
      where: { riderId },
      create: {
        riderId,
        dateOfBirth: new Date(dto.dateOfBirth),
        temporaryAddress: dto.temporaryAddress,
        permanentAddress: dto.permanentAddress,
        aadharNumber: dto.aadharNumber,
        profileCompletedAt: new Date(),
      },
      update: {
        dateOfBirth: new Date(dto.dateOfBirth),
        temporaryAddress: dto.temporaryAddress,
        permanentAddress: dto.permanentAddress,
        aadharNumber: dto.aadharNumber,
        profileCompletedAt: new Date(),
      },
    });

    await this.maybeMoveToUnderReview(riderId);

    return { message: 'Profile updated' };
  }

  async uploadDocument(riderId: string, type: string, filePath: string) {
    await this.prisma.riderDocument.create({
      data: { riderId, type, filePath },
    });

    const profile = await this.prisma.riderProfile.findUnique({ where: { riderId } });

    if (!profile?.documentsCompletedAt) {
      await this.prisma.riderProfile.upsert({
        where: { riderId },
        create: { riderId, documentsCompletedAt: new Date() },
        update: { documentsCompletedAt: new Date() },
      });
    }

    await this.maybeMoveToUnderReview(riderId);

    return { message: 'Document uploaded' };
  }

  async getStatus(riderId: string) {
    const rider = await this.prisma.rider.findUnique({
      where: { id: riderId },
      include: { profile: true },
    });

    if (!rider) {
      throw new NotFoundException('Rider not found');
    }

    return {
      name: rider.name,
      status: rider.status,
      profileCompleted: !!rider.profile?.profileCompletedAt,
      documentsCompleted: !!rider.profile?.documentsCompletedAt,
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
