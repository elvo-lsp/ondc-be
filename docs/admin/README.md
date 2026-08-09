# Admin surface

How the admin domain is modelled and why. Endpoint-by-endpoint reference lives in [admin-api.md](./admin-api.md); the Next.js panel that consumes it is documented in its own repo (`elvo-dashboard/README.md`).

## Partner vs. vendor - different axes

These two are easy to conflate, so be precise about which one a given column means:

- **Partner** - a logistics organisation. Owns admin logins, employs riders, contracts with vendors. **This is the tenant boundary.** Exactly one today (us).
- **Vendor** - a seller/store whose deliveries a partner's riders serve. Lives *inside* a partner. Several already exist, and admins create more at runtime.

So "multi-vendor" and "multi-partner" are unrelated features. Vendors are a normal, already-live domain relationship; partners are the tenancy axis, currently degenerate at one row.

Built now: the `Partner` table with `partnerId` FKs on `AdminUser`/`Vendor`/`Rider`, `partnerId` in the admin JWT, every admin query filtered by it, and full vendor CRUD. Deliberately **not** built: any way to create a partner over the API (they come from `prisma/seed.ts`), partner switching, per-partner config, or roles on `AdminUser` - there is no superadmin, and every admin has identical abilities inside their partner.

## Vendor chains - a third axis, orthogonal to both

A `VendorChain` groups several `Vendor` rows under one brand - "Burger King" grouping its Andheri and Powai outlets. Each outlet is still its own `Vendor` row with its own address, geofence and riders; the chain is purely a label plus a filter, not a second tenancy layer. `Vendor.chainId` is nullable because most vendors are independent - a chain is the exception, not the default shape.

Deliberately a **separate model**, not a self-referential `Vendor.parentVendorId`. A self-reference would force every column that only makes sense at one level - `address`/geofence on an outlet, nothing outlet-specific on a chain root - to be nullable on both, and leaves "is this row a chain root or an independent vendor" indistinguishable without an extra flag. Splitting the models means a chain literally cannot hold an address or a rider, and an outlet literally cannot hold another outlet.

Chains have no `isActive` - disabling happens per-outlet, and a chain with zero active outlets is already effectively inactive.

## Vendor geofence - where a rider must be to punch in

`Vendor.latitude`/`longitude`/`geofenceRadiusMeters` are optional at creation and editable later (`AdminVendorsService.resolveGeofenceFields`, `src/admin/vendors/geofence.ts`). Nothing reads them yet - punch-in isn't built - but the shape is settled now so that feature doesn't need a schema change later.

- Latitude and longitude are required **together**. A radius with no location means nothing, and a half-set location is worse than none - it would silently geofence nobody able to be near it.
- `geofenceRadiusMeters` defaults to 150 (a typical single-storefront radius, wide enough to absorb ordinary GPS drift) the first time a location is set, so an admin isn't required to type a number they'd almost always leave at the default.
- Distance will be a plain Haversine calculation against the rider's reported lat/lng when punch-in is built - no PostGIS, no spatial index. One outlet's known coordinates compared per punch-in event is a single O(1) calculation; that only stops being true if the platform ever needs "nearest outlet to this point" queries across many rows, which is a different feature.

## What a vendor needs from a rider

`Vendor.needsRiders`/`needsVehicles` are independent booleans, not one enum. A vendor can need either, both, or neither (a walk-in-only store, say). Booleans rather than a `RIDERS_ONLY | VEHICLES_ONLY | BOTH | NEITHER` enum because the requirement list is expected to grow - a future "needs packaging" or "needs cold storage" is one new column, not a rename of every existing enum value plus a migration of every stored row.

## Vendor onboarding is deliberately shallow

`POST /admin/vendors` requires only `name`. Everything else - contact details, chain, geofence, code, points of contact - is fillable later through the same `PATCH` an edit uses. There's no "draft" vendor state or a second "complete the profile" step; a vendor with nothing but a name is a fully real, usable row from the moment it's created, just a sparse one. The alternative - a wizard, or required fields that block creation - would cost the admin a finished form up front for information they often don't have yet (a store's exact coordinates, say), for a benefit ondc-be doesn't need: nothing downstream requires a vendor to be "complete" before riders can be approved against it.

### Vendor contacts

Up to 10 `VendorContact` rows per vendor, each just `{ name, designation? }` - no phone or email. That's narrower than `Vendor.contactName`/`contactPhone`/`contactEmail`, which is the *one* contact a vendor already had before this existed and stays as-is; `contacts` is the list of *people* at the vendor an admin might need to know by name and role (a store manager, a shift supervisor), not a second communication channel. If that turns out to need its own phone/email later, add the columns then - there's no reason to speculate a per-contact channel nobody has asked for yet.

Every write **replaces the full set**, never diffs against what's stored (`AdminVendorsService.update`: `contacts: { deleteMany: {}, create: contacts }` in one call). The alternative - matching incoming rows against existing ones by some client-supplied id, updating some, deleting others, inserting the rest - is real complexity for a list that's realistically edited by retyping it in a form each time, not by patching one entry among many. The panel's own contract follows from this: it always renders and submits the vendor's complete current list, never a partial one.

### Why the tenant column exists before it is needed

This is the one piece of speculative structure here, so the reasoning is worth recording rather than rediscovering:

1. Retrofitting a tenant FK onto `Rider` and `Vendor` once they hold live data means a backfill migration and a nullable-to-required transition. Adding it while the tables are empty costs three columns.
2. More importantly, **retrofitting tenant *scoping* is a security change**. Adding `where: { partnerId }` to queries written months earlier means auditing every one of them, and a single miss is a cross-tenant data leak. Writing it in from the start costs one clause per query at a point where there is one partner and nothing can leak.

The expensive, genuinely speculative half - partner onboarding, config, switching - is skipped. If multi-partner never happens the cost is one dead foreign key.

### How scoping is enforced

`AdminAuthGuard` puts `{ sub, partnerId, app: 'admin' }` on `req.admin` from the verified JWT. Controllers pass `req.admin.partnerId` into the service; **it is never read from the request body, query or params** - the same rule the rider surface applies to rider identity.

Services fold `partnerId` into the `where` clause of the lookup itself rather than fetching and then comparing:

```ts
const vendor = await this.prisma.vendor.findFirst({ where: { id, partnerId } });
if (!vendor) throw new NotFoundException('Vendor not found');
```

A record belonging to another partner is therefore indistinguishable from one that does not exist - no `403` that would confirm the id is real. This holds for nested resources too: `getDocumentFile` matches on `{ id, riderId, rider: { partnerId } }`, so a valid document id from another partner still 404s.

### Which partner a new rider belongs to

Riders sign up through a public app with no partner context, so `RiderAuthService.resolveDefaultPartnerId` resolves it from the `DEFAULT_PARTNER_CODE` env var at row-creation time and caches it in memory. Resolution is by `code`, not `id`, so the value in `.env` stays stable across environments and reseeds.

**This is the piece that has to change first when a second partner appears** - partner identity would then have to come from which app build the signup arrived through, an invite link, or a partner-specific signup URL.

Note this is *not* redundant with vendor assignment. The vendor could imply the partner at approval time, but then the pending-review pool would be unscoped, and every partner's admins would see every unassigned applicant - including decrypted Aadhaar numbers and identity documents. `partnerId` at signup is what makes the review queue partner-scoped.

## Rider review and vendor assignment

**A rider has no vendor until an admin approves them.** `Rider.vendorId` is null for every rider in `PROFILE_PENDING`, `UNDER_REVIEW` and `REJECTED`.

Riders do not choose their own vendor. Someone applying through a public Play Store app generally does not know which store they should be attached to, and it is an operational call (staffing, coverage, capacity) rather than a preference. Keeping it admin-side also means the onboarding app needs no vendor list, and no public endpoint exposes the vendor roster.

The consequence for the panel is that pending riders cannot be listed under a vendor, because they do not have one yet:

```
Admin panel
├── Rider requests          GET /admin/riders?status=UNDER_REVIEW
│     └── [Rahul Kumar]     Approve → pick vendor  |  Reject → reason
└── Vendors                 GET /admin/vendors
      └── [Big Bazaar Andheri]
            └── Riders      GET /admin/vendors/:id  (approved only)
```

Approving and assigning a vendor are one action, not two - `POST /admin/riders/:id/approve` takes the `vendorId`. There is no state where a rider is approved but unassigned.

Reviewing an application: queue (`?status=UNDER_REVIEW`, oldest first) → detail → view each document through the authenticated streaming endpoint → decide each document → approve with a vendor, or reject with a reason. Both rider-level decisions stamp `reviewedAt` and `reviewedByAdminId`.

### Two levels of rejection

Rejecting a *document* and rejecting a *rider* are different actions with different consequences, and conflating them is the easy mistake here:

| | `POST /admin/riders/:id/documents/:documentId/review` | `POST /admin/riders/:id/reject` |
| --- | --- | --- |
| Writes | `RiderDocument.status`, `rejectionComment` | `Rider.status`, `rejectionReason` |
| Rider status after | unchanged (`UNDER_REVIEW`) | `REJECTED` |
| Shown to the rider? | **yes** - it's the instruction to re-upload | no - audit record only |
| Rider can act on it? | yes, by uploading a replacement | no, terminal |

A document rejection deliberately leaves the rider in `UNDER_REVIEW`. There's no fifth `RiderStatus` for it: it would behave identically to `UNDER_REVIEW`, and sending the rider back to `PROFILE_PENDING` would lose the fact that they had already submitted. The onboarding app drives its re-upload prompt off `outstandingDocuments`, not off `status`.

Because `rejectionComment` reaches the rider, it is written as an instruction ("photo is blurred, re-upload") rather than an internal note. `Rider.rejectionReason` is the opposite and must stay admin-only.

### Documents are versioned, not overwritten

A rider replacing a rejected document inserts a new `RiderDocument` row; the old one gets `supersededAt` and `supersededById` pointing at its replacement. Consequences for this surface:

- `GET /admin/riders/:id` returns **every** upload including superseded ones - that history is the point, so a reviewer can see what was rejected and what came back. `supersededAt: null` marks the one that currently counts.
- `POST .../review` refuses a superseded document (`400`), and does so as part of the write rather than as a check before it, so a simultaneous re-upload cannot land a decision on a file the rider has already replaced.
- The rejected-document flag on the list endpoint counts only live rows, so a rejection the rider has already fixed stops flagging them.
- Old files are never deleted. Nothing prunes them yet - tracked in [../rider/onboarding-flow.md](../rider/onboarding-flow.md).

### Approval requires complete documents

`POST /admin/riders/:id/approve` returns `400` if any required document type is outstanding (never uploaded, or live upload rejected). This blocks the obvious sequencing mistake - rejecting a document and then approving the rider anyway, which would onboard them on a scan the reviewer had just refused.

`GET /admin/riders/:id` returns the same `outstandingDocuments` list, computed the same way, so the panel can disable the approve button for exactly the riders the server would refuse. Don't drive that off `profile.documentsCompletedAt` - it's a denormalised flag with a writer on both surfaces, and nothing that makes a decision reads it.

## What is deliberately missing

- **The approval email.** `onboarding-flow.md` step 8 says the rider is emailed on approval. No mail provider is wired up, so it does not happen; there is a `TODO` at the write site in `AdminRidersService.approve`.
- **Resubmission after a rider-level rejection.** `REJECTED` is terminal through the API. The stored `rejectionReason` is an audit record - not shown to the rider, and there is no path back to `UNDER_REVIEW`. (Per-*document* rejection and re-upload *is* built - see above.)
- **Reversing a decision.** Approve and reject are reachable only from `UNDER_REVIEW`, so an approved rider cannot be un-approved or moved to a different vendor through the API. Add it when there is a real operational need, with whatever audit record it should leave.
- **An audit trail for vendor edits.** Creation records `createdByAdminId`; updates record nothing. See [../infra/security-debt.md](../infra/security-debt.md).
- **Bulk document decisions.** Each document is reviewed one call at a time; there is no "approve all".

## Why there is (almost) no shared rider module

Rider persistence is owned by `rider/profile`, and the admin surface reaches the same table through Prisma directly. That is deliberate: this surface's rider work is reads plus status writes, Prisma is already the shared data-access layer, and a module in between would be a pass-through wrapper.

The transition rules are split rather than shared - the rider surface owns `PROFILE_PENDING -> UNDER_REVIEW`, this one owns both transitions out of `UNDER_REVIEW`, and neither needs the other's logic.

The bar for extracting a module is shared *business* logic, not a shared table. Two things meet it:

- **`src/aadhaar/`** - the rider app encrypts, the panel decrypts, so it belongs to neither.
- **`src/rider/documents/`** - added with per-document review. `RiderProfile.documentsCompletedAt` now has a writer on **both** sides: the rider by uploading, an admin by rejecting or approving a single document. `RiderDocumentsService.syncCompletion` owns that recompute (and `outstandingFor`, which the approve guard uses) so the rule lives in one place instead of drifting between the two write sites. It is intentionally tiny - the required-type list plus pure helpers plus one recompute - and it is *not* a rider-persistence wrapper.

Note the failure mode this avoids: if the admin surface rejected a document without recomputing `documentsCompletedAt`, the rider app would keep showing documents as done while an admin waited for a re-upload that the rider had no reason to send.

## Seeding

`prisma/seed.ts` creates the single partner and the first admin login. Idempotent; re-running only updates the admin's password hash, never their `partnerId`, so a reseed cannot silently move an admin between tenants.

```
npx prisma db seed                # partner + admin
./scripts/seed-dev-riders.sh      # riders across every status (needs the server running)
```

It runs under `tsx` rather than `ts-node` because the generated Prisma client ships `.ts` sources whose internal imports use `.js` specifiers, which ts-node does not resolve.
