import { Prisma } from '@prisma/client';

/** Round-trips a value through JSON so it satisfies Prisma's strict Json input type. */
export function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
