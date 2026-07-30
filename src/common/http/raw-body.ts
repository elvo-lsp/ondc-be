import { Request } from 'express';

// Populated by the json({ verify }) middleware in main.ts. Needed because signature
// verification must hash the exact bytes the sender signed - re-serializing the parsed
// body with JSON.stringify is not guaranteed byte-identical. See docs/ondc/auth.md.
export interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

export function getRawBody(req: RawBodyRequest): Buffer {
  if (!req.rawBody) {
    throw new Error(
      'Raw body not captured - check the json({ verify }) middleware in main.ts',
    );
  }
  return req.rawBody;
}
