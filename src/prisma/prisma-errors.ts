import { Prisma } from '../../generated/prisma/client';

/**
 * The columns a P2002 unique-constraint violation actually collided on.
 *
 * Prisma's classic query engine puts this at `err.meta.target`. Under the
 * driver adapters (`@prisma/adapter-pg`, what this project uses), that field is
 * never populated - the real column list is nested under
 * `err.meta.driverAdapterError.cause.constraint.fields` instead, as the raw
 * Postgres column names (some quoted, e.g. `"partnerId"`, some not). Reading
 * `target` alone silently returns nothing under the adapter, which is why every
 * P2002 message that branched on it was reporting the wrong field.
 *
 * Falls back to `target` too, in case a future Prisma version restores it.
 */
export function prismaUniqueConstraintFields(err: unknown): string[] {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) {
    return [];
  }

  const meta = err.meta as
    | {
        target?: string | string[];
        driverAdapterError?: {
          cause?: { constraint?: { fields?: unknown } };
        };
      }
    | undefined;

  const adapterFields = meta?.driverAdapterError?.cause?.constraint?.fields;
  if (Array.isArray(adapterFields)) {
    return adapterFields
      .filter((f): f is string => typeof f === 'string')
      .map((f) => f.replace(/"/g, ''));
  }

  const target = meta?.target;
  if (Array.isArray(target)) return target;
  if (typeof target === 'string') return [target];

  return [];
}
