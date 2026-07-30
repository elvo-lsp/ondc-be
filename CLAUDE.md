# ondc-be — ONDC Logistics LSP (BPP)

Seller-side (BPP) implementation of the ONDC Logistics domain (`nic2004:60232`) — what a real
courier/logistics company deploys to receive orders from buyer NPs and fulfill them. Built from
scratch on NestJS. **We are the LSP; we never initiate `/search` etc, we receive them and answer
with `/on_search` etc.**

Spec source: `ONDC - API Contract for Logistics (v1.2.0).pdf`. Don't re-read the PDF — the
condensed reference lives in `docs/ondc/*.md`, one file per API pair plus `overview.md` (shared
context envelope, ACK/NACK, async pattern) and `auth.md` (signing/registry). **Read the relevant
`docs/ondc/<action>.md` before touching that module.** Each module doc includes a Mermaid
flowchart of that module's actual logic.

## Working conventions

- **Keep it simple.** Build exactly what the current phase needs. Don't add abstractions,
  interfaces, or "shared framework" code for APIs that aren't implemented yet — extract shared
  code only once a second module actually needs it.
- **Every module ships with a flowchart** in its `docs/ondc/*.md` file — logic should be
  readable from the doc before opening the code.
- All 7 API pairs are async: sync response is ACK/NACK only, the real answer is a signed POST to
  `context.bap_uri + '/on_<action>'` sent later. See `docs/ondc/overview.md`.

**Every inbound-request module (controller + processor pair) follows this exact shape — copy the
`search` module's pattern, don't reinvent it:**
1. Controller: `@UseGuards(SignatureGuard)` (mandatory — an endpoint without it is unauthenticated;
   also directly `import { CryptoModule }` into that module's `imports`, not just `OndcModule` —
   Nest resolves a class-referenced guard's own dependencies from the *consuming* module, so
   `SigningService` must be reachable there too, re-exporting it from `OndcModule` alone isn't
   enough).
2. Controller: structural validation (CPU-only) → NACK if invalid.
3. Controller: `queue.add(jobName, data, { jobId: '<bap_id>:<transaction_id>:<message_id>' })` —
   **the only I/O before ACK**, and it doubles as free layer-1 dedup for in-flight retries. No DB
   write before ACK, ever.
4. Controller: return ACK.
5. Processor (worker, off critical path): first action is `create()` the audit-log row with a
   unique constraint on `(transactionId, messageId)` — catch the unique-violation as "already
   processed, skip" (layer-2 dedup, catches retries arriving after the original job completed).
   Then do the real work, sign, POST the callback, update the log's final status.
6. Queue registration: set `defaultJobOptions` (`attempts`, `backoff`, bounded
   `removeOnComplete`/`removeOnFail`) — a callback POST can transiently fail and shouldn't die on
   the first attempt, and job history shouldn't grow Redis memory unboundedly.

This is the resolution to "fast ACK" vs "must check duplicates/verify signatures": signature
verification is CPU + a cached (1hr TTL) public key lookup, structural validation is CPU-only, and
the mandatory enqueue call is free real estate for dedup — none of that requires a database
round-trip. The database only gets touched in the background worker.

## Tech stack

- **NestJS** (TypeScript) — HTTP layer.
- **PostgreSQL + Prisma** — orders/fulfillments/serviceability/audit trail.
- **BullMQ + Redis** — every inbound request enqueues a job; a processor does the real work and
  fires the callback. This is what makes ACK-then-callback reliable across restarts.
- **tweetnacl + blakejs** — ed25519 signing / Blake2b digest for the `Authorization` header
  (pure JS, chosen over libsodium to avoid native bindings).
- pnpm.

## Folder map

```
src/
  config/            env validation + typed ConfigService
  common/
    http/            raw-body capture types (signature verification needs exact wire bytes)
    ondc/            context DTO, ack/nack builders, outbound callback service, SignatureGuard
    crypto/           signing.service.ts (sign + verify), registry.service.ts (cached /lookup)
  queue/             BullMQ/Redis connection setup
  modules/
    search/          Phase 1 — controller, service, processor, module
docs/ondc/           condensed per-API spec reference (read before coding a module)
prisma/schema.prisma
docker-compose.yml   local Postgres + Redis
```

## Env vars (`.env`, see `.env.example`)

`DATABASE_URL`, `REDIS_URL`, `SUBSCRIBER_ID`, `SUBSCRIBER_URL`, `SIGNING_PRIVATE_KEY`,
`SIGNING_PUBLIC_KEY`, `UK_ID`, `REGISTRY_URL`, `ONDC_ENVIRONMENT` (`staging`/`preprod`/`prod`),
`DEV_TRUSTED_SUBSCRIBER_ID`/`DEV_TRUSTED_SUBSCRIBER_PUBLIC_KEY` (dev-only registry fallback for
testing inbound signature verification locally, see `docs/ondc/auth.md`).

## Known gaps (deliberately deferred, not oversights)

- No SSRF hardening on `bap_uri` beyond signature verification (a legitimately-registered but
  compromised participant could still point it at an internal address). Would need a
  DNS-rebinding-safe HTTP client.
- No dead-letter alerting once a job exhausts its retry attempts — it just stays `FAILED` in the
  audit log for now.

## Phase roadmap

| Phase | APIs | Scope | Status |
|---|---|---|---|
| 0 | — | Foundation: config, Prisma, BullMQ, ONDC envelope/ACK helpers, signing | ✅ done |
| 1 | `/search`, `/on_search` | Serviceability check + catalog response | ✅ done |
| 2 | `/init`, `/on_init` | Quote + T&C agreement | not started |
| 3 | `/confirm`, `/on_confirm` | Order placement, shipment manifest | not started |
| 4 | `/status`, `/on_status` | Order status + audit trail | not started |
| 5 | `/update`, `/on_update` | Fulfillment updates, labels/AWB/EBN | not started |
| 6 | `/cancel`, `/on_cancel` | Cancellation flow | not started |
| 7 | `/track`, `/on_track` | Live tracking | not started |

## Commands

```bash
docker compose up -d          # Postgres + Redis
pnpm install
pnpm prisma migrate dev       # apply schema
pnpm prisma db seed           # seed provider/categories/serviceable areas
pnpm run start:dev
pnpm test
```
