# Aadhaar number handling

Aadhaar numbers are never stored in plaintext. `src/aadhaar/` owns the crypto; both surfaces go through it - the rider app writes, the admin panel reads.

## Why not plaintext

The Aadhaar (Sharing of Information) Regulations require Aadhaar numbers to be held encrypted, and the DPDP Act 2023 makes a plaintext breach a reportable incident. Beyond compliance, a database dump of plaintext numbers hands over every rider's Aadhaar as queryable text at once.

## Why not just a hash

The obvious cheap option is to store only `last4` plus a hash and never keep the number. That was the original plan and it was **wrong for this product**: admins need the full number during review, to check the number a rider typed actually matches the number on the Aadhaar scan they uploaded. Last-4 only verifies the last four digits.

So the number has a genuine read-back requirement, which is exactly the case encryption exists for.

## What's stored

Three columns on `RiderProfile`, all nullable (a rider may not have submitted a profile yet):

| Column | Purpose |
| --- | --- |
| `aadhaarCiphertext` | `Bytes` - AES-256-GCM, layout `iv (12) \|\| authTag (16) \|\| ciphertext`. Read back for admin verification. |
| `aadhaarHash` | HMAC-SHA256 under a server-side pepper. **Unique** - this is what detects the same Aadhaar registering twice, since you cannot query on ciphertext. |
| `aadhaarLast4` | Cheap display/search without touching the ciphertext. |

GCM, not CBC: the auth tag means tampering with a stored value fails loudly at decrypt rather than silently producing a different number.

The hash needs to be deterministic to carry a unique index, which is exactly what makes it a weak point - a pepper is what stops an attacker with the database from brute-forcing all 10^12 possible Aadhaar numbers against it. Keep `AADHAAR_HASH_PEPPER` out of the database and out of backups that include it.

## Keys

Both from env, both `getOrThrow` so the app refuses to boot without them:

- `AADHAAR_ENCRYPTION_KEY` - 32 bytes hex. Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
- `AADHAAR_HASH_PEPPER` - any high-entropy string.

**Neither can be rotated in place.** Changing the encryption key makes every stored number undecryptable; changing the pepper breaks duplicate detection for everything already stored. Real rotation needs a re-encryption pass over the table with a key-version column, which is not built. In production these belong in a secrets manager (or KMS envelope encryption) rather than a `.env` file - see [security-debt.md](./security-debt.md).

## Reads are logged

`GET /admin/riders/:id` decrypts, and `AadhaarService.logAccess` records `admin=<id> rider=<id> at=<iso>`. UIDAI expects retrieval to be traceable.

A log line is the minimum, not the finished thing - it isn't queryable and rotates away with the logs. A persistent audit table is tracked in [security-debt.md](./security-debt.md).

## What this does not cover

**The uploaded Aadhaar scan still contains the number as an image.** Encrypting the column doesn't change that, and it's why the document endpoint is authenticated and partner-scoped rather than a static folder. Whatever the database does, the images are the other half of the exposure - see [file-storage.md](./file-storage.md).
