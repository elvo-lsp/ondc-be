import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '../../../generated/prisma/client';
import { CreateVendorChainDto } from './dto/create-vendor-chain.dto';
import { UpdateVendorChainDto } from './dto/update-vendor-chain.dto';
import { ListVendorChainsDto } from './dto/list-vendor-chains.dto';

@Injectable()
export class AdminVendorChainsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(partnerId: string, query: ListVendorChainsDto) {
    const chains = await this.prisma.vendorChain.findMany({
      where: {
        partnerId,
        ...(query.search
          ? { name: { contains: query.search, mode: 'insensitive' } }
          : {}),
      },
      orderBy: { name: 'asc' },
      include: {
        createdByAdmin: { select: { id: true, name: true } },
        _count: { select: { vendors: true } },
      },
    });

    return chains.map(({ _count, ...chain }) => ({
      ...chain,
      vendorCount: _count.vendors,
    }));
  }

  async create(partnerId: string, adminId: string, dto: CreateVendorChainDto) {
    try {
      return await this.prisma.vendorChain.create({
        data: { ...dto, partnerId, createdByAdminId: adminId },
        include: { createdByAdmin: { select: { id: true, name: true } } },
      });
    } catch (err) {
      if (isPrismaError(err, 'P2002')) {
        throw new ConflictException(
          'A vendor chain with this name already exists',
        );
      }
      throw err;
    }
  }

  async findOne(partnerId: string, id: string) {
    const chain = await this.prisma.vendorChain.findFirst({
      where: { id, partnerId },
      include: {
        createdByAdmin: { select: { id: true, name: true } },
        vendors: {
          orderBy: { name: 'asc' },
          select: { id: true, name: true, isActive: true, address: true },
        },
      },
    });

    if (!chain) {
      throw new NotFoundException('Vendor chain not found');
    }

    return chain;
  }

  async update(partnerId: string, id: string, dto: UpdateVendorChainDto) {
    try {
      // partnerId in the where clause: another partner's chain matches
      // nothing, surfacing as P2025 -> 404.
      return await this.prisma.vendorChain.update({
        where: { id, partnerId },
        data: dto,
        include: { createdByAdmin: { select: { id: true, name: true } } },
      });
    } catch (err) {
      if (isPrismaError(err, 'P2025')) {
        throw new NotFoundException('Vendor chain not found');
      }
      if (isPrismaError(err, 'P2002')) {
        throw new ConflictException(
          'A vendor chain with this name already exists',
        );
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
