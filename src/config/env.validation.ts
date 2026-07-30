const REQUIRED_KEYS = [
  'DATABASE_URL',
  'REDIS_URL',
  'SUBSCRIBER_ID',
  'SUBSCRIBER_URL',
  'UK_ID',
] as const;

// Signing keys are required to send real /on_search callbacks but not to boot the app
// locally (e.g. running unit tests) - so we warn instead of throwing when they're blank.
const RECOMMENDED_KEYS = [
  'SIGNING_PRIVATE_KEY',
  'SIGNING_PUBLIC_KEY',
  'REGISTRY_URL',
] as const;

export function validate(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const missing = REQUIRED_KEYS.filter((key) => !config[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  }

  const missingRecommended = RECOMMENDED_KEYS.filter((key) => !config[key]);
  if (missingRecommended.length > 0) {
    console.warn(
      `[config] Missing recommended env vars (needed to sign/send callbacks): ${missingRecommended.join(', ')}`,
    );
  }

  return config;
}
