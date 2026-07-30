# ONDC Logistics — Signing & Registry Lookup

## Key pairs

- Signing: **ed25519**. Encryption: **X25519**. Base64-encoded public keys go in the ONDC registry.
- This repo uses `tweetnacl` (pure JS, no native build) for ed25519 sign/verify instead of
  libsodium — same algorithm, avoids native-binding install pain.

## Signing a request/response (`Authorization` header)

1. UTF-8 byte array of the JSON payload.
2. Blake2b hash of that byte array (`blakejs`).
3. Base64-encode the hash → this is the **digest**.
4. Sign the digest with your ed25519 private signing key.
5. Header:
   ```
   Authorization: Signature keyId="{subscriber_id}|{ukId}|ed25519",algorithm="ed25519",created="...",expires="...",headers="(created) (expires) digest",signature="{base64 signature}"
   ```

Implemented in `src/common/crypto/signing.service.ts`.

## Verifying an inbound request

Implemented: `SigningService.verify()` (`src/common/crypto/signing.service.ts`), enforced by
`SignatureGuard` (`src/common/ondc/signature.guard.ts`), applied per-controller with
`@UseGuards(SignatureGuard)` — **every new module's controller must add this** (not global, so it
doesn't block plain infra routes like `GET /`). If you add a new controller and forget the guard
decorator, that endpoint is unauthenticated - this is a checklist item, not optional.

Steps, over the **raw request bytes** (not a re-serialized JS object — see below):
1. Parse `keyId`/`created`/`expires`/`signature` out of the `Authorization` header.
2. Reject if `expires` has already passed (replay protection).
3. Look up `signing_public_key` via `RegistryService.getSigningPublicKey(subscriberId, ukId)`
   (`src/common/crypto/registry.service.ts`) — in-memory cached for 1hr so this doesn't add
   registry-round-trip latency to every request, only the first one per subscriber.
4. Recompute the Blake2b digest and signing string, verify with `nacl.sign.detached.verify`.
5. Any failure (malformed header, expired, unknown subscriber, bad signature, registry
   unreachable) → **fails closed** → `SignatureGuard` throws → HTTP 401. Never "allow through" on
   ambiguity.

**Raw body requirement**: `main.ts` disables Nest's default body parser and installs
`json({ verify })` manually so the exact signed bytes survive as `req.rawBody` — `JSON.stringify`
of the parsed object is not guaranteed byte-identical (key order/spacing) to what was signed. See
`src/common/http/raw-body.ts`.

**Local dev without a reachable registry**: if `ONDC_ENVIRONMENT` isn't `prod`/`production` and
the real `/lookup` call fails, `RegistryService` falls back to `DEV_TRUSTED_SUBSCRIBER_ID` /
`DEV_TRUSTED_SUBSCRIBER_PUBLIC_KEY` from env — this still exercises the real crypto verification
path (sign a test request with a matching throwaway keypair), it just skips the network call to a
real registry. Structurally can't apply in prod (gated on `ONDC_ENVIRONMENT`).

## Registry `/lookup`

Request:
```json
{ "subscriber_id": "lsp.com", "domain": "nic2004:60232", "type": "BPP" }
```
Response: array of matching registry entries (a subscriber can be registered under multiple
`ukId`s), each with `subscriber_url`, `signing_public_key`, `encr_public_key`, `status`, etc.

## Sender identity

`keyId="{subscriber_id}|{unique_key_id}|{algorithm}"` — carried in the `Authorization` header,
identifies who signed the request so the receiver knows which public key to fetch.
