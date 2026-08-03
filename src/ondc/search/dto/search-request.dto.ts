export interface OndcContext {
  domain: string;
  country: string;
  city: string;
  action: string;
  core_version: string;
  bap_id: string;
  bap_uri: string;
  transaction_id: string;
  message_id: string;
  timestamp: string;
  ttl: string;
}

export interface SearchRequestDto {
  context: OndcContext;
  message: Record<string, any>;
}
