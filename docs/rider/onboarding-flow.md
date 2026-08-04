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
   - Admin assigns a **vendor** (the seller/store this rider will serve) - a rider has no vendor until this point. Note this is *not* the tenancy decision; tenancy is the **partner**, set at signup. See [`../admin/README.md`](../admin/README.md).
   - Rider status moves to approved/onboarded.
   - Rider receives an **email notification** that they're approved. **Not implemented** - no mail provider is wired up yet.
9. Rider downloads the operations app and logs in for real work.

On rejection: rider stays blocked from the operations app. The admin's rejection reason is stored but not shown to the rider, and there's no resubmission path (still TBD).

The admin half of steps 7-8 is built - see [`../admin/README.md`](../admin/README.md).

## Rider status states (draft)

There is no "signed up, not yet verified" status - no row exists in that state at all (see above), so `PROFILE_PENDING` is the first reachable status.

- `PROFILE_PENDING` - OTP verified (rider row just created), profile/documents not yet submitted.
- `UNDER_REVIEW` - profile/documents submitted, awaiting admin decision.
- `APPROVED` - admin approved, vendor assigned, can use the operations app.
- `REJECTED` - admin rejected (resubmission flow TBD).

This surface owns the `PROFILE_PENDING -> UNDER_REVIEW` transition only. Both transitions out of `UNDER_REVIEW` belong to the admin surface.

## Shared with the admin surface

Both surfaces read and write the same `Rider` record, but they share a table rather than logic: this surface owns profile/document writes and the transition into `UNDER_REVIEW`, the admin surface owns the two transitions out of it, and neither needs the other's rules. Rider persistence therefore stays owned by `rider/profile` - Prisma is already the shared data-access layer, so a module in between would be a pass-through. See [`../admin/README.md`](../admin/README.md).

The one piece of genuinely shared logic is Aadhaar encryption, which is why `src/aadhaar/` sits outside both.

## Known security debt

Tracked in [`../infra/security-debt.md`](../infra/security-debt.md) with every other surface's, rather than duplicated here. The rider-specific entries are the plaintext OTP logging and the unthrottled OTP endpoints.

## Open questions / not yet decided

- Document list (beyond Aadhaar/PAN/DL placeholder).
- Rejection + resubmission UX.
- Whether operations-app login reuses the same phone+OTP mechanism or something else, gated by `status === APPROVED`.
