# Docs

Organized by surface, matching `src/` - if you're working on a feature, check the folder with the same name first.

- `ondc/` - ONDC network protocol layer (auth/signing, search, future actions like confirm/cancel/track). Not created yet - no dedicated doc exists until there's something specific enough to write down beyond what's in code/project memory.
- [`rider/`](./rider/) - rider-facing apps (onboarding app + operations app).
- [`admin/`](./admin/) - admin panel backend. The Next.js panel itself is documented in the `elvo-dashboard` repo's README.
- [`infra/`](./infra/) - cross-cutting decisions (storage, crypto, security) that aren't specific to one surface.

## Index

### rider/
- [onboarding-flow.md](./rider/onboarding-flow.md) - the two-app (Play Store onboarding app + private operations app) rider signup/verification/admin-approval flow, including status states, per-document rejection and re-upload, and open questions.
- [onboarding-api.md](./rider/onboarding-api.md) - API reference for `rider/auth`, `rider/documents` and `rider/profile`: endpoints, request/response shapes, the two per-app logins, document versioning, and the status auto-transition logic.

### admin/
- [README.md](./admin/README.md) - how the admin domain is modelled: partner vs. vendor, why the tenant column exists before multi-partner does, how `partnerId` scoping is enforced, the review/approve/reject flow, and what's deliberately not built.
- [admin-api.md](./admin/admin-api.md) - endpoint reference for `admin/auth`, `admin/vendors` and `admin/riders`.

### infra/
- [security-debt.md](./infra/security-debt.md) - the single cross-surface list of known security gaps, what each actually exposes, and what's already fixed.
- [aadhaar.md](./infra/aadhaar.md) - how Aadhaar numbers are encrypted and hashed, why encryption rather than hashing alone, and why the keys can't be rotated in place.
- [file-storage.md](./infra/file-storage.md) - current local-disk storage for rider documents, explicitly temporary, and what has to change before production.
- [redis.md](./infra/redis.md) - what Redis is used for (rider OTPs), why, and the durability tradeoffs accepted for this use case.

## Conventions

- One doc per concern, named for what it covers, not when it was written. A surface's `README.md` holds its domain model and reasoning; a separate `*-api.md` holds the endpoint reference, because looking up a request shape and understanding the design are different jobs.
- Update a doc in place as the feature evolves - these describe current behavior, not a changelog. Git history already covers "what changed and when."
- New docs go under the surface folder matching where the code lives in `src/` (`ondc/`, `rider/`, `admin/`). Cross-cutting concerns go under `infra/`.
- Frontend docs live in the frontend repo, not here.
- Whenever a doc or subfolder is added or removed, update this README's index so it stays a complete, accurate map - don't let it drift out of sync.
