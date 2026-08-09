# Redis usage

Rider OTPs are the only thing in Redis - both the signup one and the login one.

## What's stored

Both live in `src/rider/auth/rider-auth.service.ts` with a 5-minute TTL (`EX 300`), under **two deliberately separate key namespaces**:

### `rider-otp:{email}` - signup, sent by email

```json
{ "code": "123456", "name": "Rahul Kumar", "phone": "+919876543210" }
```

`name` and `phone` ride along with the OTP because no `Rider` row exists yet - it is created on successful verification, from exactly these values. They are absent when `register` matches an existing rider by email *or* phone: the code then goes to that rider's own email instead, with nothing to carry.

### `rider-login-otp:{email}` - returning-rider login, sent by email

```json
{ "code": "123456" }
```

`code` alone: the rider already exists, so there is nothing to carry. `Rider.email` is stored lowercased (see [../rider/onboarding-api.md](../rider/onboarding-api.md#emails-are-normalised-on-write-never-matched-loosely-on-read)), so the key is unambiguous: one address, one rider, one slot. That normalisation is what makes this safe - two riders differing only by case would otherwise share this key, and a code issued for one could mint a token for the other.

**Why two namespaces rather than one.** Verifying a signup OTP can *create* a `Rider`; verifying a login OTP must never do that. Separate keys mean a code issued by one flow cannot be redeemed against the other's endpoint, so the create path stays reachable only from the flow that is supposed to create.

## Why Redis instead of Postgres for this

- OTPs are inherently short-lived - Redis's native key expiry means no cleanup job is needed, unlike a DB table where expired rows would just accumulate.
- Naturally a pure key-value lookup (email -> current code), not relational data.
- Losing this data (e.g. a Redis restart) is low-stakes - the rider retries, and nothing durable is gone. That is a very different risk profile from data backing a guaranteed async callback, which would need real durability; OTPs don't.

Only the transient OTP lives here; rider identity, status and profile are all Postgres. The one wrinkle is that a flush drops the pending name/email of anyone mid-registration, so they re-submit the registration form rather than just asking for a new code. A flush costs a logging-in rider nothing beyond requesting a fresh code.

## Verification semantics

A wrong code does **not** delete the stored OTP - only a successful match does (`GET` then conditional `DEL`, not `GETDEL`). This means a rider who mistypes their code can still retry with the correct one until it expires. Both flows behave the same way.

An unparseable stored value is treated as "no OTP issued" rather than raising - the caller gets the same enumeration-safe `401` as a wrong code instead of a 500.

## Not addressed here

Redis has no persistence enabled (`appendonly` off) in `docker-compose.yml` - acceptable for this specific use case per the durability reasoning above, but worth knowing if Redis usage expands to something with different stakes.
