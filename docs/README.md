# Docs

Organized by surface, matching `src/` - if you're working on a feature, check the folder with the same name first.

- `ondc/` - ONDC network protocol layer (auth/signing, search, future actions like confirm/cancel/track). Not created yet - no dedicated doc exists until there's something specific enough to write down beyond what's in code/project memory.
- [`rider/`](./rider/) - rider-facing apps (onboarding app + operations app).
- `admin/` - admin panel. Not created yet - no admin functionality exists to document.
- [`infra/`](./infra/) - cross-cutting infrastructure decisions (database, file storage, deployment) that aren't specific to one surface.

## Index

### rider/
- [onboarding-flow.md](./rider/onboarding-flow.md) - the two-app (Play Store onboarding app + private operations app) rider signup/verification/admin-approval flow, including status states, known security debt, and open questions not yet decided.
- [onboarding-api.md](./rider/onboarding-api.md) - API reference for `rider/auth` and `rider/profile`: endpoints, request/response shapes, auth requirements, and the status auto-transition logic.

### infra/
- [file-storage.md](./infra/file-storage.md) - current local-disk storage for rider documents, explicitly temporary, and what has to change before production.
- [redis.md](./infra/redis.md) - what Redis is used for (rider OTPs), why, and the durability tradeoffs accepted for this specific use case.

## Conventions

- One doc per concern, named for what it covers, not when it was written.
- Update a doc in place as the feature evolves - these describe current behavior, not a changelog. Git history already covers "what changed and when."
- New docs go under the surface folder matching where the code lives in `src/` (`ondc/`, `rider/`, `admin/`). Cross-cutting concerns that don't belong to one surface go under `infra/`.
- Whenever a doc or subfolder is added or removed, update this README's index so it stays a complete, accurate map - don't let it drift out of sync.
