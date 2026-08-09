import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { prismaUniqueConstraintFields } from '../../prisma/prisma-errors';
import { Prisma, RiderStatus } from '../../../generated/prisma/client';
import { resolveGeofenceFields } from './geofence';
import { CreateVendorDto } from './dto/create-vendor.dto';
import { UpdateVendorDto } from './dto/update-vendor.dto';
import { ListVendorsDto } from './dto/list-vendors.dto';

const VENDOR_INCLUDE = {
  createdByAdmin: { select: { id: true, name: true } },
  chain: { select: { id: true, name: true } },
  contacts: {
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true, designation: true },
  },
} satisfies Prisma.VendorInclude;

@Injectable()
export class AdminVendorsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(partnerId: string, query: ListVendorsDto) {
    const vendors = await this.prisma.vendor.findMany({
      where: {
        partnerId,
        ...(query.includeInactive ? {} : { isActive: true }),
        ...(query.chainId ? { chainId: query.chainId } : {}),
        ...(query.search
          ? { name: { contains: query.search, mode: 'insensitive' } }
          : {}),
      },
      orderBy: { name: 'asc' },
      include: {
        ...VENDOR_INCLUDE,
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
    if (dto.chainId) {
      await this.requireChain(partnerId, dto.chainId);
    }

    const geofence = resolveGeofenceFields(
      { latitude: null, longitude: null, geofenceRadiusMeters: null },
      dto,
    );

    const { contacts, ...rest } = dto;

    try {
      return await this.prisma.vendor.create({
        data: {
          ...rest,
          ...geofence,
          partnerId,
          createdByAdminId: adminId,
          ...(contacts ? { contacts: { create: contacts } } : {}),
        },
        include: VENDOR_INCLUDE,
      });
    } catch (err) {
      if (isPrismaError(err, 'P2002')) {
        throw new ConflictException(this.uniqueFieldConflict(err));
      }
      throw err;
    }
  }

  async findOne(partnerId: string, id: string) {
    const vendor = await this.prisma.vendor.findFirst({
      where: { id, partnerId },
      include: {
        ...VENDOR_INCLUDE,
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
    // Fetched first, rather than a blind update, because merging the new
    // geofence fields onto the current ones needs to see what "current" is.
    const current = await this.prisma.vendor.findFirst({
      where: { id, partnerId },
      select: { latitude: true, longitude: true, geofenceRadiusMeters: true },
    });

    if (!current) {
      throw new NotFoundException('Vendor not found');
    }

    if (dto.chainId) {
      await this.requireChain(partnerId, dto.chainId);
    }

    const geofence = resolveGeofenceFields(current, dto);
    const { contacts, ...rest } = dto;

    try {
      return await this.prisma.vendor.update({
        where: { id, partnerId },
        data: {
          ...rest,
          ...geofence,
          // Full-replace, not a diff: the panel always submits the vendor's
          // complete current contact list, so there is nothing to reconcile
          // against - see VendorContact in schema.prisma.
          ...(contacts !== undefined
            ? { contacts: { deleteMany: {}, create: contacts } }
            : {}),
        },
        include: VENDOR_INCLUDE,
      });
    } catch (err) {
      if (isPrismaError(err, 'P2002')) {
        throw new ConflictException(this.uniqueFieldConflict(err));
      }
      throw err;
    }
  }

  private async requireChain(partnerId: string, chainId: string) {
    const chain = await this.prisma.vendorChain.findFirst({
      where: { id: chainId, partnerId },
      select: { id: true },
    });

    if (!chain) {
      throw new NotFoundException('Vendor chain not found');
    }
  }

  private uniqueFieldConflict(err: unknown) {
    return prismaUniqueConstraintFields(err).includes('code')
      ? 'A vendor with this code already exists'
      : 'A vendor with this name already exists';
  }
}

function isPrismaError(err: unknown, code: string): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === code
  );
}
