# Rider onboarding API reference

Covers `src/rider/auth/`, `src/rider/documents/` and `src/rider/profile/` - the backend surface for the onboarding app described in `onboarding-flow.md`. All endpoints are JSON unless noted.

## Auth (`src/rider/auth/`) - public, no token required

Signup sits at the top level (`register`, `verify-otp`) because only one app can ever call it: a rider registers through the public onboarding app and nowhere else. **Login is namespaced per app** (`onboarding/*`), because the two rider apps log in differently and both will exist - see [Two logins](#two-logins) below.

The onboarding app verifies **everything by email** - registration and login both. Phone is collected and stored (`IsPhoneNumber('IN')` format-checked, unique) but never proven here; real phone verification belongs to the private operations app, not built yet.

### `POST /rider/auth/register`
Body: `{ name: string, email: string, phone: string }`.

**Does not write to Postgres.** Checks both fields for an existing rider first: if either the email *or* the phone already belongs to one, returns `409 Conflict` and issues no OTP at all - a returning rider uses `onboarding/login` instead. Otherwise stores `{ code, name, phone }` in Redis keyed by email (5-minute TTL) - the actual `Rider` row only gets created on successful `verify-otp` below.
```json
{ "message": "An OTP has been sent" }
```

### `POST /rider/auth/verify-otp`
Body: `{ email: string, code: string }` (6 digits).

Verifies the OTP (stored in Redis, see `docs/infra/redis.md`, 5-minute TTL) and creates the `Rider` from the name/phone stashed alongside it, at `status: PROFILE_PENDING` - there's no earlier "unverified" status. The row's `partnerId` is resolved from the `DEFAULT_PARTNER_CODE` env var, since the onboarding app serves a single logistics partner today (see `docs/admin/README.md`); `vendorId` stays null until an admin approves the rider. Issues a JWT and consumes the OTP.
```json
{ "accessToken": "<jwt>", "status": "PROFILE_PENDING" }
```
A wrong code returns `401 { "message": "Invalid or expired OTP" }` **without** consuming the real OTP - the rider can retry until it actually expires. The same 401 is returned if no OTP was ever issued for this email at all (enumeration-safe), and if the stored value is unparseable. A race is still possible between two signups that both passed `register`'s check before either had created a row; it surfaces as `409 Conflict` naming which field collided.

The issued JWT carries `{ sub: riderId, phone, app: 'onboarding' }` - `phone` here is a claim about identity, not proof; `app` is checked by the guard below, so this token cannot be used against the future operations app.

#### Phones are normalised on write, same reasoning as email

`Rider.phone` is stored **E.164** (`RiderAuthService.normalisePhone`), because `IsPhoneNumber('IN')` accepts `+919864886447`, `09864886447`, `9864886447` and `+91 98648 86447` as the same number. Without normalising, one person registering with slightly different formatting each time was four separate riders sharing a real-world phone. The migration folds existing rows the same way `LOWER()` does for email, and fails loudly on a genuine collision rather than picking a winner.

### `POST /rider/auth/onboarding/login`
Body: `{ email: string }`.

Sends a **6-digit OTP by email** if a rider with this address exists. Response is identical whether or not it does:
```json
{ "message": "If this email is registered, an OTP has been sent" }
```

Email rather than phone, deliberately. This endpoint exists for the rider who registered, got partway through, then uninstalled the app or logged out - without it they land back on the registration form and cannot reach their half-finished application. That rider is far likelier to still have their inbox than to remember which number they signed up with, and the address is already collected at registration for the approval notification.

#### Emails are normalised on write, never matched loosely on read

`Rider.email` is stored **lowercased** (`RiderAuthService.normaliseEmail`), and every lookup is an exact `findUnique`. Both halves of that sentence matter:

- **Never use `mode: 'insensitive'` here.** Prisma compiles it to `ILIKE`, which treats the value as a *pattern*. `@IsEmail()` happily accepts `%` and `_` in a local part, so `{"email":"%@gmail.com"}` would match an arbitrary rider and send *them* a login OTP - the caller needing to know no real address at all. It also breaks honest riders: `john_doe@gmail.com` would match `john.doe@gmail.com`, so a code could be mailed to the wrong inbox and the real owner could never log in.
- **Normalising is what makes the unique index mean anything.** Postgres compares text case-sensitively, so without it `a@x.com` and `A@x.com` are two separate riders sharing one lowercased OTP key - and a code issued for one could mint a token for the other.

The migration folds existing addresses with `LOWER()`. If two rows differ only by case it fails loudly rather than silently picking a winner - that is two riders claiming one address, which is a decision for a person.

**No mail provider is wired up** - the code is logged, exactly like the SMS stub. See [../infra/security-debt.md](../infra/security-debt.md).

### `POST /rider/auth/onboarding/verify-login-otp`
Body: `{ email: string, code: string }` (6 digits).

Same `{ accessToken, status }` response as `verify-otp`, and the same `app: 'onboarding'` token.

**Never creates a rider.** That is the whole reason this is a separate endpoint rather than `verify-otp` doubling as both: `verify-otp` is the tail of registration and can insert a row, and a login OTP must not be redeemable against a path that can. Both are now keyed by email, so they additionally use separate Redis namespaces (`rider-login-otp:{email}` vs `rider-otp:{email}`) rather than being distinguished by field alone.

An unknown address returns the same `401 Invalid or expired OTP` as a wrong code, so login stays enumeration-safe end to end.

### Two logins

There are two rider apps and they do not share a login:

| | Onboarding app (Play Store) | Operations app (private) |
| --- | --- | --- |
| Route prefix | `/rider/auth/onboarding/*` | `/rider/auth/operations/*` |
| Channel | email OTP (signup **and** login) | phone OTP (expected) |
| Token `app` claim | `onboarding` | `operations` |
| Status gate | any status | `APPROVED` only |
| Built? | yes | **no** |

`BaseRiderAuthGuard` already rejects a token whose `app` claim doesn't match the surface it's used against, so an onboarding token cannot reach the operations app even though both are the same rider identity. The operations login is not built; the route prefix is reserved so adding it doesn't mean renaming these.

## Profile (`src/rider/profile/`) - requires `Authorization: Bearer <token>`

All endpoints are guarded by `OnboardingRiderAuthGuard`. The rider identity is **always** taken from the verified JWT (`req.rider.sub`), never from any client-supplied field - this is a deliberate IDOR prevention: a rider cannot act on another rider's record by passing a different id/phone/email in the request body.

### Who may still edit

`POST /rider/profile` and `POST /rider/profile/documents` both require `status` to be `PROFILE_PENDING` or `UNDER_REVIEW`, and return `400` otherwise.

`UNDER_REVIEW` is included on purpose: an admin can reject a single document, and the rider has to be able to replace it without the whole application being reopened. `APPROVED` is excluded so the documents behind an approval can't move underneath it, and `REJECTED` because a rider-level rejection is terminal.

### `GET /rider/profile/me`
No body. Backs the onboarding app's home screen - status, step-completion flags, and the per-document detail the rider needs to know what to fix.

```json
{
  "name": "Rahul Kumar",
  "email": "rahul@example.com",
  "phone": "+919000000000",
  "status": "UNDER_REVIEW",
  "profileCompleted": true,
  "documentsCompleted": false,
  "canEdit": true,
  "requiredDocuments": ["AADHAAR", "PAN", "DRIVING_LICENSE"],
  "outstandingDocuments": ["PAN"],
  "documents": [
    { "id": "…", "type": "AADHAAR", "status": "APPROVED", "rejectionComment": null, "uploadedAt": "…", "reviewedAt": "…" },
    { "id": "…", "type": "PAN", "status": "REJECTED", "rejectionComment": "Photo is blurred, please re-upload", "uploadedAt": "…", "reviewedAt": "…" }
  ]
}
```

- `documents` lists only the **live** upload per type - superseded history is admin-only.
- `outstandingDocuments` is the actionable list: required types never uploaded, or whose live upload was rejected. `documentsCompleted` is just `outstandingDocuments.length === 0`, computed live rather than read from the stored flag.
- `rejectionComment` is the **document-level** comment and *is* shown to the rider - that is the point of it. This is not the same field as `Rider.rejectionReason`, which is the rider-level audit note written by `POST /admin/riders/:id/reject` and stays admin-only. Don't merge the two.

### `POST /rider/profile`
Body: `{ dateOfBirth: string (ISO date), temporaryAddress: string, permanentAddress: string, aadharNumber: string }`.

The Aadhaar number is not stored as given: it is encrypted, hashed for duplicate detection, and reduced to its last 4 digits before the row is written (see `docs/infra/aadhaar.md`). Submitting a number already registered to another rider returns `409`.

Upserts the rider's `RiderProfile` row and marks `profileCompletedAt`. If documents are also already complete, auto-transitions rider status `PROFILE_PENDING -> UNDER_REVIEW` (see below) - there's no separate manual "submit" action.

### `POST /rider/profile/documents`
`multipart/form-data`: a `file` field plus a `type` field.

`type` is validated against `REQUIRED_DOCUMENT_TYPES` (`AADHAAR`, `PAN`, `DRIVING_LICENSE`) - see [Required documents](#required-documents-srcriderdocuments). Anything else is `400`.

Returns `400` if the live document of that type is already `APPROVED`: an approved document cannot be replaced, otherwise a rider could swap a verified scan for a different one after the fact.

Note the file is written to disk by the Multer interceptor *before* the body is validated, so a request with a bad `type` still leaves a file behind. Harmless today (local disk, gitignored) but worth closing when storage moves to a bucket - see [../infra/file-storage.md](../infra/file-storage.md).

#### Re-uploads never overwrite

An admin can reject one document without rejecting the rider, so a rider must be able to send a replacement. Uploading a type that already has a live document **inserts a new row** and retires the old one, in one transaction:

```
RiderDocument (type=PAN)
  #1  status=REJECTED  supersededAt=…  supersededById=#2   <- history
  #2  status=PENDING   supersededAt=null                   <- the one that counts
```

- `supersededAt: null` identifies the live row. Every completeness check and the admin review endpoint filter on it.
- The retire step is an `updateMany` over **every** live row of that type, not an update of one row read beforehand. There is deliberately no read to go stale in between, and `supersededById` is deliberately **not** unique: if two concurrent uploads ever left two live rows, one later upload supersedes both and the state self-heals. A unique constraint there would make that statement fail and strand a live row that nothing could ever supersede - which would show up as a rider stuck flagged with a rejected document they cannot clear.
- Readers still pick the newest live row per type (`currentDocumentsByType`), tie-broken on `id`, so every caller agrees on "current" even during such a race. `uploadedAt` is `TIMESTAMP(3)`, so a tie is reachable, not theoretical.
- **An `APPROVED` document cannot be replaced**, and that guard runs *inside* the transaction after the write, rolling the upload back. Checking before the insert would be a read an admin approving concurrently could invalidate - and swapping out an already-verified scan is precisely what must not happen.
- Old rows **and their files** are kept. That is what lets a reviewing admin see what was rejected and what replaced it; it is an audit trail, not garbage. Nothing prunes it yet.

### Required documents (`src/rider/documents/`)

`REQUIRED_DOCUMENT_TYPES` is the single source of truth for what "documents complete" means. `RiderDocument.type` stays a free-form string **column** - the list is expected to grow (vehicle RC, insurance) and a Postgres enum makes every addition a migration - but `UploadDocumentDto` validates against the array, so in practice the column only ever holds one of these values.

Adding a type silently makes every existing incomplete rider incomplete again, which is intended, but means an addition belongs together with a decision about riders already approved.

This is the one piece of rider-document logic **both** surfaces need, because `RiderProfile.documentsCompletedAt` has two writers - the rider uploading, and an admin rejecting or approving a single document. `RiderDocumentsService.syncCompletion` owns the recompute so the rule can't drift between the two write sites, and `admin/riders` imports it rather than reimplementing it. See [../admin/README.md](../admin/README.md#why-there-is-almost-no-shared-rider-module).

## Status auto-transition logic

`RiderProfileService.maybeMoveToUnderReview` (called after both `updateProfile` and `uploadDocument`): if `status === PROFILE_PENDING` and both `profileCompletedAt` and `documentsCompletedAt` are set, flips status to `UNDER_REVIEW`. Order doesn't matter - whichever of profile/documents completes second triggers the transition.

`documentsCompletedAt` moves **both ways**: `syncCompletion` clears it when an admin's rejection leaves a required type outstanding, and sets it again when the rider uploads a replacement. Without that the rider app would keep showing documents as done while an admin was waiting on a re-upload.

`syncCompletion` writes **unconditionally** rather than reading the current flag and skipping when it already matches. That read was a lost update waiting to happen: with a rider uploading and an admin rejecting at the same time, one caller could see a value that made its own write look redundant and skip it, leaving the flag contradicting the documents until something else happened to write.

Because it is a denormalisation with a writer on each surface, nothing that *decides* anything reads it: `GET /rider/profile/me`, `GET /admin/riders/:id` and the approve guard all recompute from the documents.

A document rejection does **not** change `RiderStatus`. The rider stays `UNDER_REVIEW` - the admin surface owns both transitions out of that state, and "one document needs redoing" is not a decision on the rider. The onboarding app drives its re-upload UI off `outstandingDocuments`, not off `status`.
