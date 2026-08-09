# Rider Onboarding Flow

Two separate rider-facing apps, same backend:

1. **Onboarding app** - public, downloaded from the Play Store. Used only to register and get verified.
2. **Operations app** - private, only downloadable after a rider is approved and onboarded. This is the actual working app (accepting orders, deliveries, tracking).

## Flow

1. Rider downloads the onboarding app.
2. Enters name, email, phone number.
3. Verifies **signup** via **email OTP**. Phone is collected and stored (format-checked, unique) but not proven here - see [Coming back to a half-finished application](#coming-back-to-a-half-finished-application) for why the onboarding app verifies by email throughout.
4. **No `Rider` row is created until this OTP verification actually succeeds** - name/email/phone are held in Redis alongside the OTP until then, not written to Postgres on signup. This is deliberate: avoids orphaned/unverified rows piling up from abandoned signups, bot attempts, or typos, and specifically fixes a bug where a typo'd phone number would otherwise permanently block re-registering with the corrected one (see git history/`onboarding-api.md` for the mechanism). On successful verification, the row is created directly at `PROFILE_PENDING` and the rider is issued a limited-scope "onboarding" token - enough to access the profile/document screens, but not a fully onboarded rider yet.
5. Rider completes their profile and uploads the required documents: **Aadhaar, PAN and driving licence**. The list lives in one place (`REQUIRED_DOCUMENT_TYPES`) and is expected to grow - vehicle RC and insurance are the likely next entries.
6. Submission moves the rider into a **pending review** state. It happens automatically once profile *and* documents are both complete; there is no separate "submit" button.
7. Admin reviews the submitted profile/documents via the admin panel, **document by document**. Rejecting a single document does not reject the rider - it asks them to re-upload that one (see [Document rejection and re-upload](#document-rejection-and-re-upload)).
8. On approval:
   - Admin assigns a **vendor** (the seller/store this rider will serve) - a rider has no vendor until this point. Note this is *not* the tenancy decision; tenancy is the **partner**, set at signup. See [`../admin/README.md`](../admin/README.md).
   - Rider status moves to approved/onboarded.
   - Rider receives an **email notification** that they're approved. **Not implemented** - no mail provider is wired up yet.
9. Rider downloads the operations app and logs in for real work.

On rejection: rider stays blocked from the operations app. The admin's rejection reason is stored but not shown to the rider, and there's no resubmission path from a *rider-level* rejection (still TBD). Per-document rejection is different and is built - see below.

The admin half of steps 7-8 is built - see [`../admin/README.md`](../admin/README.md).

### Coming back to a half-finished application

A rider can log out, uninstall the app, or just lose the token - and the application they left behind is the thing they need to get back to. So the onboarding app has a **login**, not only a registration form:

- **Signup** proves the email, over an email OTP: `POST /rider/auth/verify-otp`.
- **Login** proves the same email, over a separate email OTP: `POST /rider/auth/onboarding/login`.

Email throughout, deliberately - a returning rider is likelier to still have their inbox than to remember which number they signed up with. Phone is still collected and stored (unique, format-checked), which is also what closes a real bug: without checking it too, the same person registering with `+919876543210`, `09876543210` and `9876543210` used to become three separate riders, and someone could even take over another rider's signup by typing their phone number with a different email. Registration now checks both fields for an existing account before issuing a code, and sends it to the real owner's email either way - see [`onboarding-api.md`](./onboarding-api.md).

The two rider apps get **separate logins** - the onboarding app's email OTP, and a future phone-OTP login for the operations app gated on `status === APPROVED`. Neither token works against the other app; see [`onboarding-api.md`](./onboarding-api.md#two-logins).

### Document rejection and re-upload

An admin reviews each document individually and can reject one with a comment. That is not a rider-level rejection:

- The rider **stays `UNDER_REVIEW`**. Only the admin surface moves a rider out of that state, and "the PAN photo is blurred" isn't a decision on the rider.
- The rider app shows which types are outstanding (`outstandingDocuments` from `GET /rider/profile/me`) and the admin's comment for each, and lets them upload a replacement.
- A replacement **never overwrites**. The old row and its file are kept and marked superseded, so the reviewer can still see what was rejected and what replaced it.
- An already-`APPROVED` document cannot be replaced.
- Once every required type has a live, non-rejected upload, the rider is complete again and the admin can approve. `POST /admin/riders/:id/approve` refuses while any type is outstanding, so a reviewer can't reject a document and then approve the rider anyway.

Rider-level `REJECTED` remains terminal and separate from all of this.

## Rider status states (draft)

There is no "signed up, not yet verified" status - no row exists in that state at all (see above), so `PROFILE_PENDING` is the first reachable status.

- `PROFILE_PENDING` - OTP verified (rider row just created), profile/documents not yet submitted.
- `UNDER_REVIEW` - profile/documents submitted, awaiting admin decision. Also where a rider sits while re-uploading a document an admin rejected.
- `APPROVED` - admin approved, vendor assigned, can use the operations app.
- `REJECTED` - admin rejected the *rider* (resubmission flow TBD, terminal today).

This surface owns the `PROFILE_PENDING -> UNDER_REVIEW` transition only. Both transitions out of `UNDER_REVIEW` belong to the admin surface.

There is deliberately **no status for "a document was rejected"**. Per-document state lives on `RiderDocument.status`, and mixing it into `RiderStatus` would mean either a fifth status that behaves exactly like `UNDER_REVIEW`, or bouncing the rider back to `PROFILE_PENDING` and losing the fact that they had already submitted. The rider app drives its re-upload UI off `outstandingDocuments`, not off `status`.

`PROFILE_PENDING` and `UNDER_REVIEW` are the two statuses in which a rider may still change their own submission (`canEdit` on `GET /rider/profile/me`).

## Shared with the admin surface

Both surfaces read and write the same `Rider` record, but they mostly share a table rather than logic: this surface owns profile/document writes and the transition into `UNDER_REVIEW`, the admin surface owns the two transitions out of it, and neither needs the other's rules. Rider persistence therefore stays owned by `rider/profile` - Prisma is already the shared data-access layer, so a module in between would be a pass-through. See [`../admin/README.md`](../admin/README.md).

Two things are genuinely shared, and each has its own module for that reason:

- `src/aadhaar/` - the rider app encrypts, the panel decrypts.
- `src/rider/documents/` - "which required documents does this rider still owe" is asked by rider uploads, the rider status endpoint, **and** admin review/approve, and `documentsCompletedAt` has a writer on each side.

## Known security debt

Tracked in [`../infra/security-debt.md`](../infra/security-debt.md) with every other surface's, rather than duplicated here. The rider-specific entries are the plaintext OTP logging and the unthrottled OTP endpoints.

## Open questions / not yet decided

- Whether the document list grows to vehicle RC / insurance, and what happens to already-approved riders when it does.
- Resubmission after a **rider-level** `REJECTED`. Per-document re-upload is built; reopening a fully rejected application is not.
- The operations-app login: phone OTP is the expectation, gated on `status === APPROVED`. The `/rider/auth/operations/*` prefix is reserved but nothing is built.
- Pruning superseded documents and their files. Nothing expires them today.
