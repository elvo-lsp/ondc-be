# Security debt

Known, accepted-for-now security gaps across all surfaces, with what has to happen before production. This is the single list - surface docs link here rather than keeping their own copies.

Only open items are listed. Defences already in place are documented where the behaviour lives, not here.

Each item says what the actual exposure is, not just what's missing. "Must fix" means before real rider data or a publicly reachable deployment, whichever comes first.

## Must fix before production

### OTPs logged in plaintext
`RiderAuthService.issueRegistrationOtp` logs the signup OTP, and `issueEmailOtp` logs the login OTP. Both are email OTPs now, and both are dev stubs while no mail provider is wired up - anyone with log read access (log aggregators, staging environments, support tooling) can read a rider's code and sign in as them with no access to their inbox at all.

**Fix:** remove both, or guard them to non-production only, when a real mail provider goes in. Don't leave them "just in case."

### Aadhaar encryption keys live in `.env`
The numbers themselves are encrypted (see [aadhaar.md](./aadhaar.md)) - this entry is about the keys. `AADHAAR_ENCRYPTION_KEY` and `AADHAAR_HASH_PEPPER` sit in a `.env` file, and neither can be rotated in place: changing the key makes every stored number undecryptable, changing the pepper breaks duplicate detection.

**Fix:** move both to a secrets manager (or KMS envelope encryption) before production, and add a key-version column plus a re-encryption pass so rotation is possible at all. Keep the pepper out of any backup that also contains the table - a deterministic hash with a known pepper is brute-forceable across all 10^12 Aadhaar numbers.

### Aadhaar access log isn't persistent
`AadhaarService.logAccess` writes a log line when an admin reads a decrypted number. UIDAI expects retrieval to be traceable, and a log line isn't queryable and rotates away.

**Fix:** a real audit table (`who`, `what`, `when`, ideally `why`). This is the same gap as the missing general audit log below, and one table could cover both.

### Admin login is not rate limited
`POST /admin/auth/login` has no throttle. argon2 makes each attempt cost ~50-100ms of CPU, which slows credential stuffing, but that cost cuts both ways: it also makes this the cheapest way for an unauthenticated caller to burn server CPU.

**Fix:** `@nestjs/throttler` on the route, keyed on IP **and** submitted email, before the panel is reachable from outside localhost. The rider OTP endpoints (`register`, `verify-otp`, `onboarding/login`, `onboarding/verify-login-otp`) need the same treatment - both verify routes let a caller retry a 6-digit code freely until it expires, which is ~10^6 guesses against a 5-minute window. `register` and `onboarding/login` additionally need it because either is an unthrottled way to have the server send mail to an address of the caller's choosing once a provider is wired up.

### Seeded admin password
`prisma/seed.ts` reads `SEED_ADMIN_PASSWORD`, and `.env.example` ships `change-me`. There's no forced password change on first login and no password reset flow.

**Fix:** set a real password before any non-local deployment. A proper fix is a forced rotation on first login, which needs a `mustChangePassword` flag and a change-password endpoint.

### Document storage is local disk
See [file-storage.md](./file-storage.md). Local disk doesn't survive a redeploy and doesn't work with more than one instance, and there's no encryption at rest.

Access control itself is **not** part of this debt - documents are already streamed through an authenticated, partner-scoped endpoint rather than a static folder. The thing to preserve when moving to object storage is exactly that: private bucket, with the endpoint issuing short-lived signed URLs or proxying bytes. A public bucket URL in `filePath` would undo it.

## Deliberately out of scope for now

Not debt, just decisions - listed so they don't get "discovered" later as oversights:

- **No admin token revocation.** 12h expiry, no refresh, no server-side session list. Logging out is a client-side token discard; a stolen token is valid until it expires.
- **No roles or permissions.** Every admin has identical abilities inside their partner. There's no superadmin.
- **Only partial audit trail.** Rider approve/reject stamps `reviewedByAdminId` + `reviewedAt`, and vendor creation stamps `createdByAdminId`. **Vendor *updates* still record nothing** - who renamed a vendor, or who disabled one, is unknown. A general audit table would cover that and the Aadhaar access log above.
