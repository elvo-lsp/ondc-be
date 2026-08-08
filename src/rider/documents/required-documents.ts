import { DocumentStatus } from '../../../generated/prisma/client';

// Pure logic - no Prisma, no DI, so both the rider and admin surfaces can use it.

/**
 * The single source of truth for "documents complete". `RiderDocument.type` stays
 * a string column rather than an enum because the list is expected to grow and an
 * enum makes every addition a migration; `UploadDocumentDto` validates against
 * this array, so the column only ever holds these values.
 */
export const REQUIRED_DOCUMENT_TYPES = [
  'AADHAAR',
  'PAN',
  'DRIVING_LICENSE',
] as const;

export type RequiredDocumentType = (typeof REQUIRED_DOCUMENT_TYPES)[number];

/** Narrow on purpose, so callers can pass a `select`ed subset rather than full rows. */
export interface DocumentForCompleteness {
  id: string;
  type: string;
  status: DocumentStatus;
  supersededAt: Date | null;
  uploadedAt: Date;
}

/**
 * The live upload per type. An upload retires every live row of its type, so
 * normally there is exactly one; a race could briefly leave two, and picking the
 * newest (tie-broken on `id`, since `uploadedAt` is only millisecond-precision)
 * keeps every caller's answer the same.
 */
export function currentDocumentsByType<T extends DocumentForCompleteness>(
  documents: T[],
): Map<string, T> {
  const current = new Map<string, T>();

  for (const document of documents) {
    if (document.supersededAt) continue;

    const existing = current.get(document.type);
    if (!existing || isNewer(document, existing)) {
      current.set(document.type, document);
    }
  }

  return current;
}

function isNewer(
  a: DocumentForCompleteness,
  b: DocumentForCompleteness,
): boolean {
  const delta = a.uploadedAt.getTime() - b.uploadedAt.getTime();
  return delta === 0 ? a.id > b.id : delta > 0;
}

/**
 * Types the rider still owes: never uploaded, or the live upload was rejected.
 * `PENDING` counts as supplied - it is waiting on review, not on the rider.
 */
export function outstandingDocumentTypes(
  documents: DocumentForCompleteness[],
): RequiredDocumentType[] {
  const current = currentDocumentsByType(documents);

  return REQUIRED_DOCUMENT_TYPES.filter((type) => {
    const document = current.get(type);
    return !document || document.status === DocumentStatus.REJECTED;
  });
}

export function documentsAreComplete(
  documents: DocumentForCompleteness[],
): boolean {
  return outstandingDocumentTypes(documents).length === 0;
}
