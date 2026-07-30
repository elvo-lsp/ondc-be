// Plain TS shapes for the /search intent - not validated by class-validator (see
// search.service.ts#validateRequest for the manual checks we actually need). Full field
// list is in docs/ondc/search.md; only the fields this module reads are typed here.

export interface SearchIntent {
  category?: { id?: string };
  fulfillment?: {
    type?: string;
    start?: { location?: { address?: { area_code?: string } } };
    end?: { location?: { address?: { area_code?: string } } };
  };
}
