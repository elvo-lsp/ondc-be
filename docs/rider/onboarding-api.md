# Rider onboarding API reference

Covers `src/rider/auth/` and `src/rider/profile/` - the backend surface for the onboarding app described in `onboarding-flow.md`. All endpoints are JSON unless noted.

## Auth (`src/rider/auth/`) - public, no token required

### `POST /rider/auth/register`
Body: `{ name: string, email: string, phone: string }` (`phone` validated as an Indian number via `IsPhoneNumber('IN')`).

**Does not write to Postgres.** If the email/phone already belongs to an existing (already-verified) rider, silently resends an OTP to that rider's real phone instead of erroring. Otherwise, stores `{ code, name, email }` in Redis keyed by phone (5-minute TTL) - the actual `Rider` row only gets created on successful `verify-otp` below. Response is identical in both cases:
```json
{ "message": "If this is a new number, an OTP has been sent" }
```
This is deliberate for two reasons: account-enumeration prevention (see `onboarding-flow.md`'s security debt section - never rely on the response to infer whether an account existed), and avoiding orphaned rows from abandoned signups or phone-number typos - re-registering with a corrected number before ever verifying just works, since nothing was persisted for the first attempt.

### `POST /rider/auth/login`
Body: `{ phone: string }`.

Sends an OTP if a rider with this phone exists. Response is identical whether or not it does:
```json
{ "message": "If this number is registered, an OTP has been sent" }
```

### `POST /rider/auth/verify-otp`
Body: `{ phone: string, code: string }` (6 digits).

Verifies the OTP (stored in Redis, see `docs/infra/redis.md`, 5-minute TTL). If this is the first successful verification for this phone (no `Rider` row yet), **creates the row now** using the name/email stashed alongside the OTP, directly at `status: PROFILE_PENDING` - there's no earlier "unverified" status. If the rider already exists (a `login` re-verification), their status is left untouched. Either way, issues a JWT and consumes the OTP.
```json
{ "accessToken": "<jwt>", "status": "PROFILE_PENDING" }
```
A wrong code returns `401 { "message": "Invalid or expired OTP" }` **without** consuming the real OTP - the rider can retry until it actually expires. The same 401 is returned if no OTP was ever issued for this phone at all (enumeration-safe). If two different phone numbers race to verify with the same pending email, the second one to complete gets `409 Conflict` - by that point the rider has already proven phone ownership, so revealing the conflict isn't an enumeration concern.

The issued JWT carries `{ sub: riderId, phone, app: 'onboarding' }` - `app` is checked by the guard below, so this token cannot be used against the future operations app.

## Profile (`src/rider/profile/`) - requires `Authorization: Bearer <token>`

All three endpoints are guarded by `OnboardingRiderAuthGuard`. The rider identity is **always** taken from the verified JWT (`req.rider.sub`), never from any client-supplied field - this is a deliberate IDOR prevention: a rider cannot act on another rider's record by passing a different id/phone/email in the request body.

### `GET /rider/profile/me`
No body. Returns the current rider's name, status, and step-completion flags - backs the onboarding app's homepage checklist UI.
```json
{ "name": "Rahul Kumar", "status": "UNDER_REVIEW", "profileCompleted": true, "documentsCompleted": true }
```

### `POST /rider/profile`
Body: `{ dateOfBirth: string (ISO date), temporaryAddress: string, permanentAddress: string, aadharNumber: string }`.

Upserts the rider's `RiderProfile` row and marks `profileCompletedAt`. If documents are also already complete, auto-transitions rider status `PROFILE_PENDING -> UNDER_REVIEW` (see below) - there's no separate manual "submit" action.

### `POST /rider/profile/documents`
`multipart/form-data`: a `file` field plus a `type` field (free-form string for now, e.g. `"AADHAR"` - no fixed enum yet since the required-document list isn't finalized, see `onboarding-flow.md`'s open questions).

Saves the file to local disk (`uploads/rider-documents/`, see `docs/infra/file-storage.md` - temporary, will move to cloud storage), creates a `RiderDocument` row, and marks `documentsCompletedAt` on the **first** upload (current heuristic: any one document counts as "documents complete" - will need revisiting once there's a real required-document list with more than one entry). Auto-transitions status the same way as above once both steps are done.

## Status auto-transition logic

`RiderProfileService.maybeMoveToUnderReview` (called after both `updateProfile` and `uploadDocument`): if `status === PROFILE_PENDING` and both `profileCompletedAt` and `documentsCompletedAt` are set, flips status to `UNDER_REVIEW`. Order doesn't matter - whichever of profile/documents completes second triggers the transition.
