import { Injectable } from '@nestjs/common';
import { Category, Prisma } from '@prisma/client';
import { toJson } from '../../common/json';
import { PrismaService } from '../../common/prisma/prisma.service';
import { minutesToIsoDuration } from './iso-duration';
import { SearchRequestDto } from './dto/search-request.dto';

interface ServiceabilityResult {
  providerId: string | null;
  categories: Category[];
}

// Serviceability check + catalog build for /search -> /on_search. See docs/ondc/search.md
// for the flowchart and field reference this implements.
@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  /** Structural validation only - unserviceable area/category is NOT a NACK, see search.md. */
  validateRequest(
    body: SearchRequestDto,
  ): { code: string; message: string } | null {
    const intent = body?.message?.intent;
    if (!intent?.category?.id) {
      return {
        code: '30000',
        message: 'message.intent.category.id is required',
      };
    }
    const startArea = intent.fulfillment?.start?.location?.address?.area_code;
    const endArea = intent.fulfillment?.end?.location?.address?.area_code;
    if (!startArea || !endArea) {
      return {
        code: '30000',
        message:
          'message.intent.fulfillment.start/end.location.address.area_code is required',
      };
    }
    return null;
  }

  /**
   * Creates the audit-trail row for a /search, or returns null if this exact
   * (transactionId, messageId) was already recorded - i.e. this is a retried/duplicate
   * request that must not be reprocessed or trigger a second /on_search callback. Called
   * from the worker (SearchProcessor), never from the controller - see docs/ondc/search.md.
   */
  async recordReceived(body: SearchRequestDto): Promise<{ id: string } | null> {
    try {
      return await this.prisma.searchLog.create({
        data: {
          transactionId: body.context.transaction_id,
          messageId: body.context.message_id,
          requestContext: toJson(body.context),
          requestPayload: toJson(body.message),
          status: 'RECEIVED',
        },
        select: { id: true },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        return null;
      }
      throw err;
    }
  }

  /**
   * Resolves the requested category id to its quotable leaf categories (expanding a
   * parent like "Standard Delivery" to its children), then checks both the start and end
   * area_code are serviceable, by the same provider, for each candidate category.
   */
  async findServiceableCategories(
    startAreaCode: string,
    endAreaCode: string,
    categoryId: string,
  ): Promise<ServiceabilityResult> {
    const requested = await this.prisma.category.findUnique({
      where: { id: categoryId },
      include: { children: true },
    });
    if (!requested) return { providerId: null, categories: [] };

    const candidateIds =
      requested.children.length > 0
        ? requested.children.map((c) => c.id)
        : [categoryId];

    const [startMatches, endMatches] = await Promise.all([
      this.prisma.serviceableArea.findMany({
        where: { areaCode: startAreaCode, categoryId: { in: candidateIds } },
      }),
      this.prisma.serviceableArea.findMany({
        where: { areaCode: endAreaCode, categoryId: { in: candidateIds } },
      }),
    ]);

    const endKeys = new Set(
      endMatches.map((m) => `${m.providerId}:${m.categoryId}`),
    );
    const serviceable = startMatches.filter((m) =>
      endKeys.has(`${m.providerId}:${m.categoryId}`),
    );
    if (serviceable.length === 0) return { providerId: null, categories: [] };

    // Single-provider LSP for now - see CLAUDE.md keep-it-simple convention.
    const providerId = serviceable[0].providerId;
    const categoryIds = [...new Set(serviceable.map((m) => m.categoryId))];
    const categories = await this.prisma.category.findMany({
      where: { id: { in: categoryIds } },
    });

    return { providerId, categories };
  }

  async buildCatalog(providerId: string, categories: Category[]) {
    const provider = await this.prisma.provider.findUniqueOrThrow({
      where: { id: providerId },
    });

    const items = categories.map((cat, idx) => ({
      id: `I${idx + 1}`,
      category_id: cat.id,
      fulfillment_id: '1',
      descriptor: {
        code: cat.shipmentType,
        name: `${cat.tatMinutes}-minute delivery`,
      },
      price: { currency: cat.currency, value: cat.basePrice!.toFixed(2) },
      time: { label: 'TAT', duration: minutesToIsoDuration(cat.tatMinutes!) },
    }));

    return {
      'bpp/descriptor': { name: 'ONDC LSP' },
      'bpp/providers': [
        {
          id: provider.id,
          descriptor: {
            name: provider.name,
            short_desc: provider.shortDesc,
            long_desc: provider.longDesc,
          },
          categories: categories.map((cat) => ({
            id: cat.id,
            time: {
              label: 'TAT',
              duration: minutesToIsoDuration(cat.tatMinutes!),
            },
          })),
          fulfillments: [{ id: '1', type: 'Delivery' }],
          items,
        },
      ],
    };
  }
}
