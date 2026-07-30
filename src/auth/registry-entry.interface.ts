export interface RegistryEntry {
  subscriber_id: string;
  status: string;
  ukId: string;
  subscriber_url: string;
  country: string;
  domain: string;
  valid_from: string;
  valid_until: string;
  type: string;
  signing_public_key: string;
  encr_public_key: string;
  created: string;
  updated: string;
  city: string;
}
