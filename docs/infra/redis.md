# Redis usage

Rider phone-verification OTPs are the only thing in Redis.

## What's stored

`src/rider/auth/rider-auth.service.ts`, key `rider-otp:{phone}`, 5-minute TTL (`EX 300`). The value is JSON, not just the code:

```json
{ "code": "123456", "name": "Rahul Kumar", "email": "rahul@example.com" }
```

`name` and `email` are only present for a first-time registration. They ride along with the OTP because no `Rider` row exists yet - it is created on successful verification, from exactly these values. A `login` re-verification stores `code` alone.

## Why Redis instead of Postgres for this

- OTPs are inherently short-lived - Redis's native key expiry means no cleanup job is needed, unlike a DB table where expired rows would just accumulate.
- Naturally a pure key-value lookup (phone -> current code), not relational data.
- Losing this data (e.g. a Redis restart) is low-stakes - the rider retries, and nothing durable is gone. That is a very different risk profile from data backing a guaranteed async callback, which would need real durability; OTPs don't.

Only the transient OTP lives here; rider identity, status and profile are all Postgres. The one wrinkle is that a flush drops the pending name/email of anyone mid-registration, so they re-submit the registration form rather than just asking for a new code.

## Verification semantics

A wrong code does **not** delete the stored OTP - only a successful match does (`GET` then conditional `DEL`, not `GETDEL`). This means a rider who mistypes their code can still retry with the correct one until it expires.

## Not addressed here

Redis has no persistence enabled (`appendonly` off) in `docker-compose.yml` - acceptable for this specific use case per the durability reasoning above, but worth knowing if Redis usage expands to something with different stakes.
