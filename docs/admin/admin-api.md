# Admin panel API reference

Covers `src/admin/` - the backend for the admin panel. All endpoints are JSON unless noted. Everything except `POST /admin/auth/login` requires `Authorization: Bearer <token>` and is guarded by `AdminAuthGuard`.

Every endpoint here is scoped to the calling admin's partner. See [README.md](./README.md) for how and why.

## Auth (`src/admin/auth/`)

### `POST /admin/auth/login`
Body: `{ email: string, password: string }`.

```json
{ "accessToken": "<jwt>" }
```

Returns `401 { "message": "Invalid email or password" }` for both an unknown email and a wrong password. When no admin matches, the service still runs an argon2 verification against a throwaway hash so the two cases take the same time - without it the response latency alone reveals which admin emails exist.

**Not rate limited.** argon2 makes each attempt cost ~50-100ms of CPU, which slows credential stuffing but also makes this the cheapest way to burn server CPU from an unauthenticated endpoint. Needs a throttle (`@nestjs/throttler`, keyed on IP and email) before this is publicly reachable.

The JWT carries `{ sub: adminId, partnerId, app: 'admin' }` and expires in **12h** (riders get 7d; an admin session is a desk session, not a phone that stays logged in). It is signed with `ADMIN_JWT_SECRET`, deliberately **not** the rider `JWT_SECRET` - a leaked rider secret must not be able to mint admin tokens. The `app: 'admin'` claim is checked on top of that, so the separation still holds if the two secrets are ever misconfigured to the same value.

There is no signup, password reset or admin-creates-admin endpoint. Admins come from `prisma/seed.ts`.

### `GET /admin/auth/me`
```json
{
  "id": "…", "name": "Admin", "email": "admin@elvo.local",
  "partner": { "id": "…", "name": "ELVO" }
}
```

## Vendors (`src/admin/vendors/`)

### `GET /admin/vendors`
Query: `includeInactive` (bool, default false), `chainId` (uuid), `search` (case-insensitive name match).

Returns vendors with an `approvedRiderCount`, a `chain` (`{ id, name }`, or `null`), and a `createdByAdmin` (`{ id, name }`, or `null`). Inactive vendors are hidden by default so the vendor picker on the rider-approval screen only ever offers assignable ones.

### `POST /admin/vendors`
Body: `{ name: string, code?, contactName?, contactPhone?, contactEmail?, address?, chainId?, latitude?, longitude?, geofenceRadiusMeters?, needsRiders?, needsVehicles?, contacts? }`. `contactPhone` is validated as an Indian number. Only `name` is required - everything else can be filled in later via `PATCH`, so onboarding a vendor isn't blocked on details an admin doesn't have yet.

`partnerId` **and** the recorded creator are taken from the JWT, never the body. Duplicate name within the same partner returns `409` (names are unique per partner, not globally - two partners may both have a "Big Bazaar Andheri"). `code` is unique per partner **when set**, and can otherwise be left out entirely. `chainId` must belong to the same partner - `404` otherwise, same as an unassignable vendor id anywhere else in this surface. The `409` message names whichever of `name`/`code` actually collided.

`latitude`/`longitude` are optional but must be given together - `400` if only one is present. `geofenceRadiusMeters` is only meaningful once a location exists, so providing it without a location is `400`; providing a location without a radius defaults it to `150`. See [README.md](./README.md#vendor-geofence---where-a-rider-must-be-to-punch-in).

`needsRiders` defaults to `true`, `needsVehicles` to `false`.

`contacts` is an array of `{ name: string, designation?: string }`, max 10. Each becomes a `VendorContact` row. There's no per-contact phone/email here - see [README.md](./README.md#vendor-contacts) if that turns out to be needed later.

`Vendor.createdByAdminId` is nullable, for the same reason as `Rider.reviewedByAdminId`: an admin can be removed without deleting their vendors, and a vendor seeded by a script has no admin to point at. Only `id` and `name` of the creating admin are ever selected - the relation must never widen to expose `email` or `passwordHash`.

### `GET /admin/vendors/:id`
Vendor detail plus its **approved** riders. `404` if the vendor belongs to another partner.

### `PATCH /admin/vendors/:id`
Body: any subset of the create fields, plus `isActive: boolean`.

The geofence fields are merged onto the vendor's **current** values, not replaced wholesale - updating just `geofenceRadiusMeters` on a vendor that already has a location leaves that location untouched, and the same both-or-neither / default-to-150 rules apply to the merged result. Moving a vendor to a different chain (or out of one) is a normal `chainId` update; there is no dedicated endpoint for it.

`contacts`, when present, **replaces the full set** rather than merging - omit the key to leave existing contacts untouched, or send `[]` to clear them all. There is no per-contact update; the panel always submits the vendor's complete current list.

There is no delete. Vendors are soft-disabled via `isActive: false` because approved riders reference them; disabling only blocks *new* rider assignments and hides the vendor from the default list. Riders already assigned are untouched.

## Vendor chains (`src/admin/vendor-chains/`)

See [README.md](./README.md#vendor-chains---a-third-axis-orthogonal-to-both) for what a chain is and isn't.

### `GET /admin/vendor-chains`
Query: `search` (case-insensitive name match). Returns chains with a `vendorCount` and a `createdByAdmin`.

### `POST /admin/vendor-chains`
Body: `{ name: string }`. Same partner-scoped uniqueness and creator-from-JWT rules as vendors.

### `GET /admin/vendor-chains/:id`
Chain detail plus every vendor in it (`{ id, name, isActive, address }` each, active and inactive alike - unlike the vendor list, there's no default filter here).

### `PATCH /admin/vendor-chains/:id`
Body: `{ name?: string }`. Rename only - there is no delete, and no `isActive`; see [README.md](./README.md#vendor-chains---a-third-axis-orthogonal-to-both) for why a chain has no active state of its own.

## Riders (`src/admin/riders/`)

### `GET /admin/riders`
Query: `status` (`RiderStatus` enum), `vendorId` (uuid), `search` (matches name, email or phone), `page` (default 1), `limit` (default 25, max 100).

The panel's **rider requests** queue is just this endpoint with `status=UNDER_REVIEW`. Ordering is `createdAt` **ascending** - the review queue is FIFO so riders are not left waiting behind newer signups.

```json
{
  "total": 1, "page": 1, "limit": 25,
  "riders": [{
    "id": "…", "name": "Rahul Kumar", "email": "…", "phone": "…",
    "status": "UNDER_REVIEW", "createdAt": "…", "vendor": null,
    "hasRejectedDocs": false
  }]
}
```

`hasRejectedDocs` counts only **live** rejected documents (`supersededAt: null`), so a rejection the rider has already replaced stops flagging the row - otherwise every rider who ever had a document bounced would stay flagged forever.

### `GET /admin/riders/:id`
Full rider record: profile, assigned vendor, reviewing admin, and the document list.

Documents come back as `{ id, type, uploadedAt, status, rejectionComment, reviewedAt, reviewedByAdmin, supersededAt, supersededById }`. `filePath` is deliberately **not** selected - it is a server-side path and nothing the panel should ever see or be able to send back.

**Every** upload is returned, superseded ones included, ordered by `uploadedAt`. Filter on `supersededAt === null` for the document that currently counts; the rest are the history of what was rejected and what replaced it. `supersededById` points at the replacement, so the panel can render a chain per type.

Also returns `outstandingDocuments: DocumentType[]` - the required types the rider still owes, **computed live from the documents** rather than read from `profile.documentsCompletedAt`. Use this, not the stored flag, to decide whether the approve button should be enabled: it is the same thing the approve guard checks, so the panel and the server cannot disagree.

### `POST /admin/riders/:id/documents/:documentId/review`
Body: `{ action: 'approve' | 'reject', comment?: string }` (1-1000 chars).

Decides **one document**, without deciding the rider. Sets `RiderDocument.status` and stamps `reviewedAt` / `reviewedByAdminId`.

```json
{
  "id": "…", "type": "PAN", "status": "REJECTED",
  "rejectionComment": "Photo is blurred, please re-upload",
  "reviewedAt": "…", "reviewedByAdmin": { "id": "…", "name": "Admin" },
  "documentsCompleted": false
}
```

- `comment` is **required** when `action` is `reject`, enforced in the service and not only by the DTO (the DTO can't express "required only for one action"). Whitespace-only is rejected.
- On `approve` the stored comment is cleared, so a re-approval doesn't leave a stale rejection note behind.
- `documentsCompleted` is the recomputed rider-level flag, returned so the panel doesn't need a follow-up fetch to know whether approval is now possible.
- `404` if the rider or document belongs to another partner.
- `400` if the rider is not `UNDER_REVIEW` - document-level decisions only make sense while the application is in review.
- `400` if the document is superseded. Review the replacement instead. `supersededAt: null` is part of the `WHERE` of the write itself (an `updateMany` whose affected count is checked), not a separate read beforehand - so a rider re-uploading at the same moment cannot slip between the check and the write and have a decision recorded against a file they have already replaced.

**The `rejectionComment` is shown to the rider.** It is the instruction that tells them what to re-upload, so write it as one. This is the opposite of `Rider.rejectionReason` below. See [README.md](./README.md#two-levels-of-rejection).

Rejecting a document clears `RiderProfile.documentsCompletedAt` via `RiderDocumentsService.syncCompletion`; the rider's own status is untouched.

### `POST /admin/riders/:id/approve`
Body: `{ vendorId: string (uuid) }`.

Sets `status: APPROVED`, assigns the vendor, and stamps `reviewedAt` / `reviewedByAdminId`. Vendor assignment happens **here** rather than during rider onboarding - see [README.md](./README.md).

- `404` if the rider or the vendor belongs to another partner.
- `400` if the vendor is inactive.
- `400` if the rider is not `UNDER_REVIEW`.
- `400` if any required document is outstanding - never uploaded, or its live upload was rejected. The message lists the types. This stops the sequencing mistake of rejecting a document and approving the rider anyway.

The approval email described in `docs/rider/onboarding-flow.md` is **not sent yet** - no mail provider is wired up. There is a `TODO` at the write site.

### `POST /admin/riders/:id/reject`
Body: `{ reason: string }` (1-1000 chars, required).

Sets `status: REJECTED`, stores the reason, and stamps the reviewer. This rejects the **rider**, not a document. The reason is an audit trail only - it is not surfaced to the rider, and there is no resubmission flow (still an open question in `docs/rider/onboarding-flow.md`). Same `404`/`400` rules as approve, minus the outstanding-documents check.

### `GET /admin/riders/:id/documents/:documentId/file`
Streams the document file inline. Works for superseded documents too - the point of keeping them is being able to look at what was rejected.

These are identity scans - Aadhaar, PAN, driving licence. They are streamed through this authenticated endpoint rather than served from a static `uploads/` folder, where possessing the URL would be enough to read them. The document is matched on `{ id, riderId, rider: { partnerId } }`, so a valid document id from another partner still `404`s.

Three things about this endpoint exist because **both halves of the response filename were rider-controlled** - `RiderDocument.type` used to be a free-form upload field, and the extension still comes from the uploaded file's original name. `type` is now validated against a fixed allowlist on upload, but none of this is removed: rows written before that constraint existed are still in the table, and the read side must not depend on the write side having been strict.

- `Content-Type` comes from an **allowlist** (`.jpg/.jpeg/.png/.webp/.pdf`). Anything else is served as `application/octet-stream` with a `.bin` extension, so a rider cannot get an uploaded `.html` or `.svg` to render in an admin's browser. `X-Content-Type-Options: nosniff` backs this up.
- The `type` is stripped to `[a-zA-Z0-9_-]` and capped at 50 chars before it reaches `Content-Disposition`. Unsanitised, a `type` containing a quote or newline breaks the header - Node rejects the CR/LF outright, so the document would 500 for the reviewing admin every time.
- The resolved path is checked for containment inside `uploads/rider-documents/`. `filePath` is written by our own multer config and never by a client, so this is defence in depth against a future bug turning this into an arbitrary file read.

`UploadDocumentDto.type` constrains the write end too - now an `@IsIn(REQUIRED_DOCUMENT_TYPES)` allowlist, which is strictly stronger than the character/length check it replaced. Both ends stay enforced deliberately: the read-site sanitising is what protects the header, and the upload validation is what keeps the column clean.

## Status transitions owned by this surface

`PROFILE_PENDING -> UNDER_REVIEW` is automatic and owned by the rider surface (`RiderProfileService.maybeMoveToUnderReview`).

The admin surface owns only the two decisions out of `UNDER_REVIEW`:

```
UNDER_REVIEW --approve--> APPROVED   (+ vendor assigned)
UNDER_REVIEW --reject---> REJECTED   (+ reason stored)
```

`requireReviewableRider` enforces that both are reachable **only** from `UNDER_REVIEW`. That blocks re-deciding an already-reviewed rider, and blocks deciding on one who has not finished submitting their profile and documents. Reversing a decision is not possible through the API today - deliberately, until the resubmission flow is designed.
