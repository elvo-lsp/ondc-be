# File storage (rider documents)

**Current state: local disk, temporary.** Rider-uploaded documents (Aadhar, etc.) are written to a local `uploads/` folder on disk (gitignored) via Multer, with the file path stored in the `RiderDocument.filePath` column.

This is a deliberate placeholder, not a production decision:

- Local disk doesn't survive a redeploy/container restart in most hosting setups, and doesn't work at all once there's more than one app instance.
- No access control, encryption at rest, or CDN in front of it.

**To do before going to production:** replace with real cloud object storage (S3, or equivalent) - swap out the storage implementation in `rider/profile` (currently a plain Multer disk destination) for an upload to a bucket, and store the resulting object key/URL in `RiderDocument.filePath` instead of a local path. The `RiderDocument` schema shape (`type`, `filePath`, `uploadedAt`) shouldn't need to change - only what `filePath` actually points to.

**Also flagged, not yet addressed:** `Rider.aadharNumber` is sensitive PII stored as plain text right now. Should be encrypted at rest (or at minimum masked in any admin-facing read path) before this goes anywhere near production data.
