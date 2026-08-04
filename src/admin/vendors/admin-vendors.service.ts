import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma, RiderStatus } from '../../../generated/prisma/client';
import { CreateVendorDto } from './dto/create-vendor.dto';
import { UpdateVendorDto } from './dto/update-vendor.dto';
import { ListVendorsDto } from './dto/list-vendors.dto';

@Injectable()
export class AdminVendorsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(partnerId: string, query: ListVendorsDto) {
    const vendors = await this.prisma.vendor.findMany({
      where: {
        partnerId,
        ...(query.includeInactive ? {} : { isActive: true }),
        ...(query.search
          ? { name: { contains: query.search, mode: 'insensitive' } }
          : {}),
      },
      orderBy: { name: 'asc' },
      include: {
        createdByAdmin: { select: { id: true, name: true } },
        _count: {
          select: { riders: { where: { status: RiderStatus.APPROVED } } },
        },
      },
    });

    return vendors.map(({ _count, ...vendor }) => ({
      ...vendor,
      approvedRiderCount: _count.riders,
    }));
  }

  async create(partnerId: string, adminId: string, dto: CreateVendorDto) {
    try {
      return await this.prisma.vendor.create({
        data: { ...dto, partnerId, createdByAdminId: adminId },
        include: { createdByAdmin: { select: { id: true, name: true } } },
      });
    } catch (err) {
      if (isPrismaError(err, 'P2002')) {
        throw new ConflictException('A vendor with this name already exists');
      }
      throw err;
    }
  }

  async findOne(partnerId: string, id: string) {
    const vendor = await this.prisma.vendor.findFirst({
      where: { id, partnerId },
      include: {
        createdByAdmin: { select: { id: true, name: true } },
        riders: {
          where: { status: RiderStatus.APPROVED },
          orderBy: { name: 'asc' },
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            status: true,
          },
        },
      },
    });

    if (!vendor) {
      throw new NotFoundException('Vendor not found');
    }

    return vendor;
  }

  async update(partnerId: string, id: string, dto: UpdateVendorDto) {
    try {
      // partnerId in the where clause: another partner's vendor matches
      // nothing, surfacing as P2025 -> 404.
      return await this.prisma.vendor.update({
        where: { id, partnerId },
        data: dto,
      });
    } catch (err) {
      if (isPrismaError(err, 'P2025')) {
        throw new NotFoundException('Vendor not found');
      }
      if (isPrismaError(err, 'P2002')) {
        throw new ConflictException('A vendor with this name already exists');
      }
      throw err;
    }
  }
}

function isPrismaError(err: unknown, code: string): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === code
  );
}
