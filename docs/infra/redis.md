# Redis usage

**First real Redis usage in this codebase** (2026-08-03) - `docker-compose.yml` had a Redis service from early on, but nothing in the app talked to it until rider OTPs moved here.

## What's stored

Rider phone-verification OTPs (`src/rider/auth/rider-auth.service.ts`). Key pattern: `rider-otp:{phone}` → the 6-digit code, with a 5-minute TTL (`EX 300`).

## Why Redis instead of Postgres for this

- OTPs are inherently short-lived - Redis's native key expiry means no cleanup job is needed, unlike a DB table where expired rows would just accumulate.
- Naturally a pure key-value lookup (phone -> current code), not relational data.
- Losing this data (e.g. a Redis restart) is low-stakes - worst case the rider taps "resend," nothing durable is lost. This is a very different risk profile than e.g. data you'd need for guaranteed async callback delivery (see the ONDC `/on_search` discussion in project context) - that kind of data would need real durability guarantees; OTPs don't.

There was a Postgres `RiderOtp` table before this (migration `move_otp_to_redis` dropped it). Rider identity/status/profile still live in Postgres - only the transient OTP itself moved.

## Verification semantics

A wrong code does **not** delete the stored OTP - only a successful match does (`GET` then conditional `DEL`, not `GETDEL`). This means a rider who mistypes their code can still retry with the correct one until it expires, matching the UX of the original Postgres-backed implementation.

## Not addressed here

Redis has no persistence enabled (`appendonly` off) in `docker-compose.yml` - acceptable for this specific use case per the durability reasoning above, but worth knowing if Redis usage expands to something with different stakes.
