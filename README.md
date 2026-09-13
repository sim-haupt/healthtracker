# Wellspace — personal health tracker

A private health tracker foundation with email/password authentication, two database-backed health profiles per account, and an initial Supabase schema. Events supports creating, viewing, editing, deleting, and listing records. The dashboard, calendar, shared filters, categories, tags, private attachments, and application-wide document library are implemented. Settings supports profile names/photos and category/tag management.

## Structure

- `apps/web`: Next.js App Router, TypeScript, Tailwind CSS; Vercel frontend.
- `apps/api`: Express REST API, TypeScript; Railway backend.
- `supabase/migrations`: PostgreSQL tables, indexes, triggers, and Row Level Security.
- `supabase/tests`: executable PostgreSQL isolation tests using an in-memory database.

Use Node.js **22 or later** (`.nvmrc`), npm workspaces, and the root lockfile.

## Local setup

```sh
nvm use
npm ci
cp apps/web/.env.example apps/web/.env.local
cp apps/api/.env.example apps/api/.env
```

1. Follow [database setup and account approval](supabase/README.md). Apply all migrations in filename order and approve an existing Supabase email/password account. Approval creates two default health profiles.
2. Set the project URL and **publishable** key in both environment files. Legacy anon keys also work. Never use a secret/service-role key in either runtime.
3. Keep `NEXT_PUBLIC_API_URL=http://localhost:4000` and `FRONTEND_ORIGIN=http://localhost:3000` locally.
4. Run `npm run dev`, then open http://localhost:3000. Sign in with your approved account.

Next.js reads `apps/web/.env.local`; dotenv reads `apps/api/.env` when started through its workspace script. Restart after environment changes. No secrets or live credentials are committed.

The prior development preview bypass has been removed. Without configuration or a valid authenticated account, private routes redirect to `/login`. The old `NEXT_PUBLIC_ENABLE_DEV_PREVIEW` and `ALLOWED_USER_IDS` variables are unused and should be removed from any local or deployment settings. Approvals now live in `public.app_users`, shared by API authorization and RLS.

## Authentication and private data

- Supabase handles email/password credentials. `@supabase/ssr` stores the session in cookies so both Next.js and the browser use the same login. Existing local-storage-only sessions from the scaffold require a fresh login.
- The Next.js proxy verifies identity with `auth.getUser()`, refreshes session cookies, and redirects unauthenticated requests before page rendering. The protected server layout independently verifies identity and enabled database membership. Private routes are dynamically rendered and use private/no-store responses.
- Express verifies the bearer token with Supabase Auth on every `/api/*` request and checks the database approval list. It creates a separate Supabase client for each request with the caller's JWT. Database queries remain subject to RLS; no privileged credential is used.
- The frontend waits for authorized profiles before showing the workspace. Sign-out clears the visible profile state and performs a full navigation to clear Next.js client route state. Session identity changes in another tab reload the workspace.
- `GET /health` is public. `GET /api/v1/me` returns only the approved caller's ID. `GET /api/v1/profiles` returns that caller's profile IDs, names, reserved avatar paths, and creation timestamps.
- One approved login owns one workspace and two people profiles. Other approved logins have isolated workspaces. See the database guide before introducing shared account access.

The SSR cookies must be readable by Supabase's browser client and are not HttpOnly. Do not put health data in browser storage, URLs, logs, analytics, or session replay. Use HTTPS in production. API responses are no-store, Helmet is enabled, and CORS allows only the configured frontend origin. CORS is not an authorization boundary. The initial in-memory rate limiter assumes a single API replica.

## Validation

```sh
npm run typecheck
npm test
npm run build
npm run format:check
```

API tests exercise verified token handling, private-route access, profile queries, the full event CRUD lifecycle, validation, cross-account denial, failures, CORS, and cache headers. Form tests cover all event types, field mappings, date validation, and preserving hidden details. Database tests execute the migration and real RLS policies against two isolated users and malicious read/write attempts. Real Supabase login and token refresh require configured credentials; tests never touch a remote database.

Production builds use Next.js's supported webpack bundler to avoid a local Turbopack process/port restriction. Development uses Turbopack.

## Deployment

### Vercel frontend

Import the repository with the Next.js framework and `apps/web` as Root Directory. Enable workspace source access outside the root if prompted. Use the root lockfile for installation (`npm ci` from the repository root); build the web workspace with `npm run build` and keep Next.js's default output. Set the three public values from `apps/web/.env.example`, with `NEXT_PUBLIC_API_URL` pointing to the HTTPS Railway origin. Public environment values require a rebuild when changed.

### Railway API

Deploy from the repository root using `railway.json`. It builds/starts only the API workspace, binds to `0.0.0.0` on Railway's `PORT`, and checks `/health`. Set Node.js 22 or later. Set the API variables with `NODE_ENV=production`, the exact HTTPS Vercel origin in `FRONTEND_ORIGIN` (no trailing slash), and `TRUST_PROXY_HOPS=1` for Railway's proxy. The API fails startup on invalid configuration and shuts down gracefully on SIGTERM.

### Supabase

Apply all migrations in filename order and approve the intended account before deployment. Disable public signups; keep the Auth Site URL set to the frontend domain and any future redirect URLs explicitly restricted. `DATABASE_URL` is optional for migration tooling and not used by the REST API. The attachments migration creates the private `health-attachments` bucket and its Storage policies. No service-role key is needed.

No remote database changes or deployment are performed automatically by this repository.

## Health events

Use **Events → New event** to record a health moment. The header profile selector filters the list and dashboard count; the event form can select either profile. Lists show 20 records per page, newest first, with shared filters. A saved event opens its detail view; edits and deletes return updated data from the API. Deletion requires confirmation and cascades to existing event/tag associations.

Supported types: Doctor Visit, Illness, Medication, Vaccination, Examination / Test, Injury, Symptom, and Other. Only profile, type, title, and start date/time are required. Optional fields change labels and prominence by type; **More details** exposes the remaining fields. Changing type preserves entries, including fields moved into More details. Doctor Visit maps “Reason for visit” to `description` and “What was done” to `treatment`; Illness maps “How it felt” to `description`. No schema changes are needed for these labels.

Dates are entered/displayed in the device's local timezone and sent as ISO timestamps with offsets. Invalid local times, end-before-start, blank titles, unsupported types, invalid profile IDs, and oversized text have validation errors. Title/doctor/location allow 300 characters; long detail fields allow 5,000. Failed saves preserve the form in memory; drafts are not persisted to browser storage. Cancel asks before discarding changes, and refresh/closing the page warns about unsaved entries. Edits currently use last-write-wins; there is no concurrent-edit merge UI.

### REST API

All event endpoints require `Authorization: Bearer <Supabase access token>` and approved membership. POST/PUT require `Content-Type: application/json`. The caller's token enforces RLS throughout; foreign or missing event IDs return the same 404 response. Never send `owner_id`, `id`, or server timestamps in a write body.

| Method | Route                | Behavior                                                  |
| ------ | -------------------- | --------------------------------------------------------- |
| GET    | `/api/v1/events`     | `{ events, total, page, page_size }`; list summaries only |
| POST   | `/api/v1/events`     | Create, return `201 { event }` plus Location header       |
| GET    | `/api/v1/events/:id` | Return `200 { event }` with full details                  |
| PUT    | `/api/v1/events/:id` | Replace editable fields, return `200 { event }`           |
| DELETE | `/api/v1/events/:id` | Delete, return `204` with no body                         |

List filters: optional `profile_id` and `event_type`, `page` (default 1), `page_size` (default 20; max 100). Ordering is descending `event_date`, then ID for a stable tie-breaker. Without a profile filter, all of the authenticated owner's events are returned. Unknown query/body fields are rejected.

POST and PUT accept the same shape:

```json
{
  "profile_id": "REPLACE_WITH_OWN_PROFILE_UUID",
  "event_type": "Doctor Visit",
  "title": "Annual check-up",
  "event_date": "2026-09-11T10:00:00+02:00",
  "end_date": null,
  "doctor": "Dr Example",
  "description": "Reason for the visit",
  "treatment": "What was done",
  "diagnosis": null,
  "prescription": null,
  "symptoms": null,
  "location": null,
  "notes": "Follow-up details",
  "category_id": null,
  "tag_ids": []
}
```

PUT is full replacement of editable fields, not a partial patch: omitted optional detail fields become null, and omitted description becomes an empty string. Validation responses use `400 { error, fields }`, where `fields` maps field names to message arrays. Other responses include 401 (invalid session), 403 (unapproved/revoked access), 404 (unavailable event), 413 (body over 256 KB), 415 (wrong media type), and 503 (data service unavailable). No database error details or event contents are logged.

The initial Supabase migration must already be applied and the account approved. Apply `supabase/migrations/202609120001_tracker_experience.sql` after the initial migration before running this version. Supabase credentials are needed to validate the live end-to-end flow; automated tests use synthetic records only.

## Dashboard, calendar, and labels

The dashboard groups upcoming events, recent events, illnesses, and doctor visits by health profile. Choose **Both profiles** or one person in the header. The month calendar displays events on every day they span; select a day for its full list, open an event, or add one with that date prefilled. Dates use the device's local timezone.

Dashboard, Calendar, and Events share search and filters in memory across navigation. Search matches titles, descriptions, symptoms, diagnoses, and notes, case-insensitively and literally. **More filters** contains category, tags, and date range. Selected tags must all match; date ranges include both selected calendar days and include overlapping events. Clear filters resets every filter. Health search text stays out of browser URLs and storage.

An event can have one optional category and up to 20 tags. Create custom tags or categories in the event form. Starter labels are seeded by the second migration. Event and tag changes save atomically, and cross-workspace category/tag links are rejected by the database.

Additional authenticated endpoints:

| Method | Route                      | Behavior                                          |
| ------ | -------------------------- | ------------------------------------------------- |
| POST   | `/api/v1/events/search`    | Paginated event summaries; filters in JSON body   |
| POST   | `/api/v1/events/dashboard` | Filtered counts and event groups for each profile |
| GET    | `/api/v1/categories`       | Own category list                                 |
| POST   | `/api/v1/categories`       | Create category with `{ "name": "…" }`            |
| GET    | `/api/v1/tags`             | Own tag list                                      |
| POST   | `/api/v1/tags`             | Create tag with `{ "name": "…" }`                 |

Search/list filters accept `profile_id`, `event_type`, `category_id`, `tag_ids` (UUID array, or comma-separated query value), `q` (up to 200 characters), `date_from` (inclusive ISO timestamp), and `date_to` (exclusive ISO timestamp), plus pagination. The calendar retrieves all result pages for its visible dates. PUT omission clears category and tags. Duplicate label names return 409; names are trimmed and limited to 100 characters.

## Private attachments

Apply `supabase/migrations/202609120002_attachments.sql` after the two earlier migrations. It creates the attachments table, private `health-attachments` bucket, 10 MB bucket limit, MIME allowlist, and owner/membership policies. Ensure the project's global Storage limit is at least 10 MB. The bucket name is fixed in code and SQL; the old reserved `SUPABASE_STORAGE_BUCKET` setting is unused.

Save an event first, then use **Attachments → Upload file** on its detail page. Images have thumbnails and a full-image dialog; all files have filename, type, size, download, and confirmed deletion controls. PDF, JPEG, PNG, WebP, GIF, DOC/DOCX, XLS/XLSX, PPT/PPTX, ODT, RTF, TXT, and CSV are supported. Files must be non-empty and at most 10 MiB. Filename extension and MIME type must match; HTML, SVG, executables, and macro-enabled Office extensions are excluded. This is file-type validation, not malware scanning.

Authenticated API endpoints:

| Method | Route                                               | Behavior                                                 |
| ------ | --------------------------------------------------- | -------------------------------------------------------- |
| GET    | `/api/v1/events/:eventId/attachments`               | List own event's attachment metadata                     |
| POST   | `/api/v1/events/:eventId/attachments`               | Reserve an immutable file path and its document metadata |
| DELETE | `/api/v1/events/:eventId/attachments/:attachmentId` | Remove Storage object, then metadata; retryable          |

After reservation, the browser uploads directly to Supabase Storage with its JWT and `upsert: false`. Storage RLS requires a matching, visible attachment row, exact path, size, and MIME type. Runtime clients never use a service-role key. Downloads and image previews use authenticated Storage downloads and temporary browser Blob URLs; no public or signed URLs are issued or persisted. Blob URLs are released after use. Previously downloaded bytes cannot be revoked.

Failed uploads attempt to remove their reservation. If cleanup fails or a tab closes mid-upload, the entry can be removed using Delete. Deleting an event removes its files and metadata first; if a Storage operation fails, deletion stops and can be retried. The event foreign key restricts direct database deletion while attachment rows remain. Storage and PostgreSQL are separate services, so deletion is not one transaction: a partially completed event deletion may already have removed some files. Administrators must remove files through the Storage API before deleting accounts or manipulating attachment metadata; do not delete rows directly from `storage.objects`. Concurrent operations from multiple tabs can leave inaccessible orphan objects that require administrative cleanup.

## Documents

Apply `supabase/migrations/202609120007_documents.sql` after the vaccination migration. It adds a required document category and optional 2,000-character description to attachments; existing rows become **Other** without losing files. New uploads collect this metadata before the browser sends the file to private Supabase Storage.

**Documents** in the navigation opens `/documents`. It lists completed uploads newest first and follows the global profile selector. Search matches literal text in filenames and descriptions. Filters cover file group, related event, document category, event category, upload date, and event tags. Each result uses an authenticated Storage download and links directly to its related event. Files and metadata remain private under the existing attachment, event, and Storage RLS policies.

`POST /api/v1/documents/search` accepts the optional filters `profile_id`, `file_type`, `event_id`, `document_category`, `category_id`, `tag_ids`, `q`, `date_from`, and `date_to`, plus bounded `page` and `page_size` values. Dates form a start-inclusive, end-exclusive upload interval. Supported file groups are image, PDF, Word/rich text, spreadsheet, presentation, and text/CSV. The response is `{ documents, total }`; incomplete upload reservations are excluded.

Automated tests cover filename/type/size validation, authenticated endpoints, ownership, Storage RLS, disabled membership, and deletion constraints using synthetic records. Production Storage upload/download behavior must also be verified against the configured Supabase project; no remote bucket or database is modified by tests. The bucket rules follow [Supabase's private bucket guidance](https://supabase.com/docs/guides/storage/buckets/fundamentals).

## Settings and interface

Apply `supabase/migrations/202609120003_settings.sql` after the earlier migrations. It adds a private `profile-avatars` bucket (JPG, PNG, WebP; maximum 2 MiB) and changes category deletion to clear the event's category while keeping the event. Tag deletion removes its event associations and preserves events.

Settings lets you rename either health profile, preview a photo, save it, or remove it. Names and photos update the header, overview, and event details. Photos upload using the signed-in user's JWT; the API verifies the profile-specific path and uploaded image before saving. Replaced photos are removed after the profile is saved. Failed cleanup is reported; interrupted uploads or concurrent changes may leave old files for administrative cleanup. No public image URLs or service-role keys are used.

- `PUT /api/v1/profiles/:id`: `{ "name": "Alex", "avatar": null }` or the own profile's uploaded object path.
- `PUT /api/v1/categories/:id` and `PUT /api/v1/tags/:id`: `{ "name": "New name" }`.
- `DELETE /api/v1/categories/:id` and `DELETE /api/v1/tags/:id`: remove a label without deleting events.

Names are trimmed and limited to 100 characters. All routes require approved authentication and retain RLS. Destructive actions use confirmation dialogs. Success notifications stay across route changes and can be dismissed. Event detail sections group basic information, symptoms, diagnosis, treatment, prescriptions, notes, and attachments; only populated clinical sections are shown. Mobile navigation supports Escape, focus containment, and focus restoration. Static skeletons avoid unnecessary animation.

## Timeline

Apply `supabase/migrations/202609120004_timeline.sql` after the previous migrations. **Timeline** in the navigation opens `/timeline`, a newest-first journal across both profiles, grouped by local year, month, and day. It includes every event type and successfully uploaded attachments (including images). Event entries use the start date; document entries use the upload date and inherit their event's profile, type, category, and tags. Incomplete upload reservations are excluded.

Cards show the profile, type, title, time, labels, and a short excerpt of existing health details; no clinical conclusions are generated. An event opens its details, and a document opens the related event's attachments section. The header profile selector applies globally. Timeline search and type, provider, category, tag, date-range, and entry-type filters share one filter panel.

`POST /api/v1/events/timeline` accepts `{ "filters": { "page": 1, "page_size": 30 }, "entry_type": "all" }`. `filters` accepts the existing search/filter fields; `entry_type` is `all`, `event`, or `document`. It returns `{ items, total, page, page_size }`. Pagination orders by entry timestamp and ID descending, with up to 100 records per page. Dates use a start-inclusive, end-exclusive interval; year boundaries are calculated in the browser's local timezone. Unlike calendar overlap filtering, Timeline filters the date of each entry itself. The SQL function is security invoker and retains event, attachment, label, and Storage RLS.

## Medical Providers

Apply `supabase/migrations/202609120005_providers.sql` after the earlier migrations. **Medical Providers** supports adding, viewing, editing, and deleting providers with name, specialty, phone, email, address, website, and notes. Only the name is required. Websites must use HTTP(S); email and field lengths are validated. Deletion requires confirmation and keeps related health events.

## Vaccinations

Apply `supabase/migrations/202609120006_vaccinations.sql` after the provider migration. **Vaccinations** shows a newest-first history scoped by the global profile selector, with category and tag filters. Each vaccination uses the existing private health-event model: the event title stores the vaccine name, `event_date` stores the administered date, and the record adds optional disease and next recommended dose fields. Saved providers, notes, tags, categories, and private attachments continue to use their existing controls.

The dashboard shows up to three future next-dose dates per profile. These dates are displayed only when manually entered and are never calculated or inferred. Dates before the current database date are not presented as upcoming. After saving a vaccination, open its detail page to upload certificates or other supporting files.

Choose **Saved doctor** in an event form to link a provider. Existing free-text doctor entries remain supported and are not automatically matched by name. Selecting a saved doctor also records its current name in the event's doctor text. A provider rename updates its linked display name; deleting the provider clears the reference and retains the event's recorded text. The provider's detail page shows contact information and provider notes, followed by related appointments, diagnoses, prescriptions, tests, and event notes. Records are paginated 30 events at a time and respect the global profile selector.

The **Doctor** filter applies to Timeline and Calendar, including an event's uploaded documents. It matches the saved `provider_id`, not free-text doctor names.

Authenticated API endpoints:

| Method             | Route                                 | Purpose                                    |
| ------------------ | ------------------------------------- | ------------------------------------------ |
| GET / POST         | `/api/v1/providers`                   | List / create providers                    |
| GET / PUT / DELETE | `/api/v1/providers/:id`               | Read / replace editable fields / delete    |
| GET                | `/api/v1/providers/:id/events?page=1` | Related records, newest first, 30 per page |

POST/PUT use the seven editable fields; omitted optional fields become null. Event POST/PUT and search filters now accept optional `provider_id`. The provider table and composite owner/provider foreign key enforce workspace isolation under RLS, including direct Supabase requests. No remote migrations are applied automatically.

## Health episodes

Apply `supabase/migrations/202609120008_episodes.sql` after the Documents migration. Health episodes group related events within one profile. Each episode has a title, start date, optional end date, active/resolved status, and optional description. Use **Health episodes → Add episode** to create a group and select existing events; edit the episode to change its status or event links. Deleting an episode keeps its events and attachments.

Episodes appear in profile overviews (active first, up to four) and Timeline, with an episodes-only option. Timeline places them on their start date. Event type, provider, category, and tag filters match related events; text search matches the episode title and description. No medical conclusions or recovery dates are inferred.

Authenticated REST endpoints: `GET/POST /api/v1/episodes`, `GET/PUT/DELETE /api/v1/episodes/:id`. Listing accepts optional `profile_id`. Writes accept `title`, `profile_id`, `start_date`, nullable `end_date`, `status`, `description`, and `event_ids` (up to 500). Saving fields and event links is atomic. RLS and composite foreign keys prevent cross-account and cross-profile links. An event linked to an episode cannot change profile until it is unlinked.

## Temporary local demo

With Node 22 or later, run `npm run demo` from the repository root, then open **http://localhost:3001**.

- Email: `demo@example.com`
- Password: `Local-Health-2026!`

The demo runs entirely on loopback interfaces (ports 3001, 4000, and 54321). Stop any existing API on port 4000 before starting it. It creates synthetic Alex and Sam profiles, recent/upcoming events, two episodes, a vaccination with a future dose date, a provider, and a sample document. All data and uploaded files exist in memory and disappear when the runner stops. Restarting creates a fresh demo; sign in again if an old session remains.

This is a local Supabase-compatible test adapter, not a hosted Supabase account or a full Supabase installation. It runs the actual PostgreSQL migrations and RLS policies in PGlite and the existing Express API. It does not validate hosted Supabase Auth, Storage, or deployment behavior. No production authentication checks are disabled, no environment files are changed, and the runner refuses to start with `NODE_ENV=production`.

Run `npm run demo:check` to verify the seeded overview, episodes, and documents without opening any ports. The local runner and temporary credentials are never imported by production code.

## Event types and colors

Apply `supabase/migrations/202609120009_event_types.sql`. Settings → Event types supports adding types, editing their display names and colors, and removing them from future selection. Eight defaults are seeded for each account, using restrained teal shades. Badges and calendar accents use pale color backgrounds with grey text. Custom types use the general event fields. Built-in behavior uses stable keys, so renaming a vaccination type preserves its specialized fields and dose reminders.

Removal archives a type: existing events keep their label and color and can still be edited and filtered. New events cannot use a removed type. REST endpoints are `GET/POST /api/v1/event-types` and `PUT/DELETE /api/v1/event-types/:id`. Writes accept only `name` and a six-digit hex `color`. RLS isolates types per account. The local demo loads this migration on restart; restarting resets its sample data.
