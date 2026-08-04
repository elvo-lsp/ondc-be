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
Query: `includeInactive` (bool, default false), `search` (case-insensitive name match).

Returns vendors with an `approvedRiderCount` and a `createdByAdmin` (`{ id, name }`, or `null`). Inactive vendors are hidden by default so the vendor picker on the rider-approval screen only ever offers assignable ones.

### `POST /admin/vendors`
Body: `{ name: string, contactName?, contactPhone?, contactEmail?, address? }`. `contactPhone` is validated as an Indian number.

`partnerId` **and** the recorded creator are taken from the JWT, never the body. Duplicate name within the same partner returns `409` (names are unique per partner, not globally - two partners may both have a "Big Bazaar Andheri").

`Vendor.createdByAdminId` is nullable, for the same reason as `Rider.reviewedByAdminId`: an admin can be removed without deleting their vendors, and a vendor seeded by a script has no admin to point at. Only `id` and `name` of the creating admin are ever selected - the relation must never widen to expose `email` or `passwordHash`.

### `GET /admin/vendors/:id`
Vendor detail plus its **approved** riders. `404` if the vendor belongs to another partner.

### `PATCH /admin/vendors/:id`
Body: any subset of the create fields, plus `isActive: boolean`.

There is no delete. Vendors are soft-disabled via `isActive: false` because approved riders reference them; disabling only blocks *new* rider assignments and hides the vendor from the default list. Riders already assigned are untouched.

## Riders (`src/admin/riders/`)

### `GET /admin/riders`
Query: `status` (`RiderStatus` enum), `vendorId` (uuid), `search` (matches name, email or phone), `page` (default 1), `limit` (default 25, max 100).

The panel's **rider requests** queue is just this endpoint with `status=UNDER_REVIEW`. Ordering is `createdAt` **ascending** - the review queue is FIFO so riders are not left waiting behind newer signups.

```json
{
  "total": 1, "page": 1, "limit": 25,
  "riders": [{
    "id": "…", "name": "Rahul Kumar", "email": "…", "phone": "…",
    "status": "UNDER_REVIEW", "createdAt": "…", "vendor": null
  }]
}
```

### `GET /admin/riders/:id`
Full rider record: profile, assigned vendor, reviewing admin, and the document list.

Documents come back as `{ id, type, uploadedAt }` only. `filePath` is deliberately **not** selected - it is a server-side path and nothing the panel should ever see or be able to send back.

### `POST /admin/riders/:id/approve`
Body: `{ vendorId: string (uuid) }`.

Sets `status: APPROVED`, assigns the vendor, and stamps `reviewedAt` / `reviewedByAdminId`. Vendor assignment happens **here** rather than during rider onboarding - see [README.md](./README.md).

- `404` if the rider or the vendor belongs to another partner.
- `400` if the vendor is inactive.
- `400` if the rider is not `UNDER_REVIEW`.

The approval email described in `docs/rider/onboarding-flow.md` is **not sent yet** - no mail provider is wired up. There is a `TODO` at the write site.

### `POST /admin/riders/:id/reject`
Body: `{ reason: string }` (1-1000 chars, required).

Sets `status: REJECTED`, stores the reason, and stamps the reviewer. The reason is an audit trail only - it is not surfaced to the rider, and there is no resubmission flow (still an open question in `docs/rider/onboarding-flow.md`). Same `404`/`400` rules as approve.

### `GET /admin/riders/:id/documents/:documentId/file`
Streams the document file inline.

These are identity scans - Aadhaar, PAN, driving licence. They are streamed through this authenticated endpoint rather than served from a static `uploads/` folder, where possessing the URL would be enough to read them. The document is matched on `{ id, riderId, rider: { partnerId } }`, so a valid document id from another partner still `404`s.

Three things about this endpoint exist because **both halves of the response filename are rider-controlled** - `RiderDocument.type` is a free-form upload field, and the extension comes from the uploaded file's original name:

- `Content-Type` comes from an **allowlist** (`.jpg/.jpeg/.png/.webp/.pdf`). Anything else is served as `application/octet-stream` with a `.bin` extension, so a rider cannot get an uploaded `.html` or `.svg` to render in an admin's browser. `X-Content-Type-Options: nosniff` backs this up.
- The `type` is stripped to `[a-zA-Z0-9_-]` and capped at 50 chars before it reaches `Content-Disposition`. Unsanitised, a `type` containing a quote or newline breaks the header - Node rejects the CR/LF outright, so the document would 500 for the reviewing admin every time.
- The resolved path is checked for containment inside `uploads/rider-documents/`. `filePath` is written by our own multer config and never by a client, so this is defence in depth against a future bug turning this into an arbitrary file read.

`UploadDocumentDto.type` carries the same constraint at the write end - `@Matches(/^[A-Za-z0-9 _-]+$/)` and a 50-char cap - so junk is rejected on upload as well as neutralised on read. Both ends are enforced deliberately: the read-site sanitising is what protects the header, and the upload validation is what keeps the column clean.

## Status transitions owned by this surface

`PROFILE_PENDING -> UNDER_REVIEW` is automatic and owned by the rider surface (`RiderProfileService.maybeMoveToUnderReview`).

The admin surface owns only the two decisions out of `UNDER_REVIEW`:

```
UNDER_REVIEW --approve--> APPROVED   (+ vendor assigned)
UNDER_REVIEW --reject---> REJECTED   (+ reason stored)
```

`requireReviewableRider` enforces that both are reachable **only** from `UNDER_REVIEW`. That blocks re-deciding an already-reviewed rider, and blocks deciding on one who has not finished submitting their profile and documents. Reversing a decision is not possible through the API today - deliberately, until the resubmission flow is designed.
