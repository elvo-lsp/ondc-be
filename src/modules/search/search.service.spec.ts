import { Prisma } from '@prisma/client';
import { SearchService } from './search.service';
import { SearchRequestDto } from './dto/search-request.dto';

function makeBody(
  overrides: Partial<SearchRequestDto['message']['intent']> = {},
) {
  return {
    context: {} as SearchRequestDto['context'],
    message: {
      intent: {
        category: { id: 'Standard Delivery' },
        fulfillment: {
          start: { location: { address: { area_code: '560041' } } },
          end: { location: { address: { area_code: '560001' } } },
        },
        ...overrides,
      },
    },
  } as SearchRequestDto;
}

describe('SearchService#validateRequest', () => {
  // prisma is unused by validateRequest, so a null cast is enough for this unit test.
  const service = new SearchService(null as never);

  it('accepts a well-formed request', () => {
    expect(service.validateRequest(makeBody())).toBeNull();
  });

  it('NACKs when category.id is missing', () => {
    const body = makeBody({ category: undefined });
    const result = service.validateRequest(body);
    expect(result?.code).toBe('30000');
  });

  it('NACKs when start/end area_code is missing', () => {
    const body = makeBody({
      fulfillment: {
        start: { location: { address: {} } },
        end: { location: { address: {} } },
      },
    });
    const result = service.validateRequest(body);
    expect(result?.code).toBe('30000');
  });
});

describe('SearchService#recordReceived', () => {
  const requestBody = {
    context: {
      transaction_id: 'T1',
      message_id: 'M1',
    } as SearchRequestDto['context'],
    message: { intent: {} },
  } as SearchRequestDto;

  it('returns null when (transactionId, messageId) was already recorded (P2002)', async () => {
    const duplicateError = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      {
        code: 'P2002',
        clientVersion: '6.19.3',
      },
    );
    const prisma = {
      searchLog: { create: jest.fn().mockRejectedValue(duplicateError) },
    };
    const service = new SearchService(prisma as never);

    await expect(service.recordReceived(requestBody)).resolves.toBeNull();
  });

  it('rethrows errors that are not a duplicate-key violation', async () => {
    const prisma = {
      searchLog: {
        create: jest.fn().mockRejectedValue(new Error('connection lost')),
      },
    };
    const service = new SearchService(prisma as never);

    await expect(service.recordReceived(requestBody)).rejects.toThrow(
      'connection lost',
    );
  });
});
