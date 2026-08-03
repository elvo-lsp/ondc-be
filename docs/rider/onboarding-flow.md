# Rider Onboarding Flow

Two separate rider-facing apps, same backend:

1. **Onboarding app** - public, downloaded from the Play Store. Used only to register and get verified.
2. **Operations app** - private, only downloadable after a rider is approved and onboarded. This is the actual working app (accepting orders, deliveries, tracking).

## Flow

1. Rider downloads the onboarding app.
2. Enters name, email, phone number.
3. Verifies via **phone OTP** (SMS) - not email. Email is collected for the later notification step only, not used for verification. Matches how existing platforms (e.g. Zomato Delivery Partner) verify riders during signup.
4. **No `Rider` row is created until this OTP verification actually succeeds** - name/email/phone are held in Redis alongside the OTP until then, not written to Postgres on signup. This is deliberate: avoids orphaned/unverified rows piling up from abandoned signups, bot attempts, or typos, and specifically fixes a bug where a typo'd phone number would otherwise permanently block re-registering with the corrected one (see git history/`onboarding-api.md` for the mechanism). On successful verification, the row is created directly at `PROFILE_PENDING` and the rider is issued a limited-scope "onboarding" token - enough to access the profile/document screens, but not a fully onboarded rider yet.
5. Rider completes their profile and uploads required documents (exact document list TBD - will expand later; expect Aadhaar/PAN/Driving License/vehicle RC style documents based on industry norms).
6. Submission moves the rider into a **pending review** state.
7. Admin reviews the submitted profile/documents via the admin panel.
8. On approval:
   - Admin assigns a **vendor** (tenant) to the rider - this is where multi-tenancy is decided; a rider belongs to exactly one vendor from this point on.
   - Rider status moves to approved/onboarded.
   - Rider receives an **email notification** that they're approved.
9. Rider downloads the operations app and logs in for real work.

On rejection: rider stays blocked from the operations app (exact rejection/resubmission UX TBD).

## Rider status states (draft)

There is no "signed up, not yet verified" status - no row exists in that state at all (see above), so `PROFILE_PENDING` is the first reachable status.

- `PROFILE_PENDING` - OTP verified (rider row just created), profile/documents not yet submitted.
- `UNDER_REVIEW` - profile/documents submitted, awaiting admin decision.
- `APPROVED` - admin approved, vendor assigned, can use the operations app.
- `REJECTED` - admin rejected (resubmission flow TBD).

## Cross-surface dependency to watch

Admin approval reads/writes the same rider record that the rider app's registration/profile step creates. Per our folder-structure approach (`admin/`, `rider/`, `ondc/` own only surface-specific controllers/auth; shared domain logic gets its own module once a concrete need appears - see project memory), **this is likely the first real trigger** for pulling rider persistence into a shared module rather than having it fully owned by `rider/profile`. Not extracted yet - revisit when the admin-side review/approve endpoints are actually built.

## Known security debt (must fix before production)

From a security review on 2026-08-03:

- **OTP is logged in plaintext** (`rider-auth.service.ts`, `issueOtp`) - deliberate dev stub since the SMS provider isn't wired up yet, but it means anyone with log read access (log aggregators, staging environments, support tooling) can read a rider's OTP and complete login as them with zero possession of their phone. Must be removed/guarded (e.g. dev-only) before the real SMS provider goes in, not left in "just in case." **Still open** - moving OTP storage to Redis (see `docs/infra/redis.md`) did not change this risk; the logging call is independent of where the code is stored.
- ~~Account enumeration~~ - **Fixed 2026-08-03.** `register`, `login`, and `verify-otp` now return identical responses regardless of whether the phone/email is already registered (silently resend OTP / same generic message instead of 409/404).

## Open questions / not yet decided

- Document list (beyond Aadhaar/PAN/DL placeholder).
- Rejection + resubmission UX.
- Whether operations-app login reuses the same phone+OTP mechanism or something else, gated by `status === APPROVED`.
