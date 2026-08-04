# File storage (rider documents)

**Current state: local disk, temporary.** Rider-uploaded documents (Aadhar, etc.) are written to a local `uploads/` folder on disk (gitignored) via Multer, with the file path stored in the `RiderDocument.filePath` column.

This is a deliberate placeholder, not a production decision:

- Local disk doesn't survive a redeploy/container restart in most hosting setups, and doesn't work at all once there's more than one app instance.
- No encryption at rest, or CDN in front of it.

**To do before going to production:** replace with real cloud object storage (S3, or equivalent) - swap out the storage implementation in `rider/profile` (currently a plain Multer disk destination) for an upload to a bucket, and store the resulting object key/URL in `RiderDocument.filePath` instead of a local path. The `RiderDocument` schema shape (`type`, `filePath`, `uploadedAt`) shouldn't need to change - only what `filePath` actually points to.

## Reading documents back

The `uploads/` folder is **not** served statically. Admins read documents through `GET /admin/riders/:id/documents/:documentId/file`, which authenticates the admin, checks the document belongs to a rider in their partner, and streams the file. So access control lives at the endpoint, not the filesystem - possessing a path or a document id is not enough.

Keep that property when moving to object storage: the bucket must stay private, with the endpoint issuing a short-lived signed URL or proxying the bytes. A public bucket URL stored in `filePath` would undo it.

The uploaded Aadhaar scan contains the number as an image, so this folder is sensitive independently of the database column being encrypted - see [aadhaar.md](./aadhaar.md). Encryption at rest in Postgres does nothing for a picture of the same number sitting here.
