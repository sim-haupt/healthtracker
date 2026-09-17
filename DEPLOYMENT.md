# Production deployment

This application uses one Supabase project, one Railway service, and one Vercel project. Complete the steps in this order so the API can allow the final frontend origin and the frontend can use the final API URL.

## 1. Prepare the repository

1. Install Node.js 22 or later.
2. From the repository root, run:

   ```sh
   npm ci
   npm run typecheck
   npm test
   npm run build
   ```

3. Commit and push the production code to a private Git repository that Vercel and Railway can access.
4. Do not commit `.env`, `.env.local`, database passwords, access tokens, secret keys, or service-role keys. The committed `.env.example` files contain names only.

## 2. Create and migrate Supabase

1. Create a new Supabase project in the region closest to the intended users. Save the database password in a password manager.
2. Install and authenticate the Supabase CLI. From the repository root, initialize the CLI configuration if `supabase/config.toml` does not exist, then link this directory to the production project:

   ```sh
   npx supabase init
   npx supabase login
   npx supabase link --project-ref YOUR_PROJECT_REF
   ```

3. Review every pending migration before changing production, then apply all versioned files in `supabase/migrations`:

   ```sh
   npx supabase db push --dry-run
   npx supabase db push
   ```

   Use `db push`; never run `db reset --linked` against production. Do not run a demo seed.

4. In **Authentication → Providers → Email**, keep email/password enabled and disable public user sign-up. This application is private and uses an explicit database approval list.
5. In **Authentication → Users**, create the production login with an email and strong password, and mark the email as confirmed. Copy its Auth user UUID.
6. Open **SQL Editor**, replace the placeholder UUID in `supabase/approve-user.sql`, and execute the approval statement. This creates the two initial health profiles. Rename them later in Settings.
7. Copy these two runtime values from the project connection/API settings:
   - Project URL, such as `https://PROJECT_REF.supabase.co`
   - Publishable key (`sb_publishable_...`), or the legacy anon key if the project has not migrated keys

   The publishable key is intentionally used by browser and API clients. Do not use a secret or service-role key in Vercel or Railway.

8. In **Storage**, confirm that `health-attachments` and `profile-avatars` exist and are private. The migrations create them and their RLS policies.

## 3. Create the Vercel project shell

Create the Vercel project before finalizing Railway so you know the exact frontend origin.

1. Import the Git repository in Vercel.
2. Select the Next.js framework and set **Root Directory** to `apps/web`.
3. Enable access to source files outside the Root Directory.
4. Use these commands if Vercel does not infer the npm workspace correctly:
   - Install Command: `cd ../.. && npm ci`
   - Build Command: `cd ../.. && npm run build -w @healthtracker/web`
   - Output Directory: leave the Next.js default unchanged.
5. Add these Production environment variables:

   ```text
   NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
   NEXT_PUBLIC_API_URL=https://temporary.invalid
   ```

6. Note the assigned production domain, for example `https://healthtracker.vercel.app`. The initial deployment can be completed with the temporary API URL; update it after Railway has a public domain.

## 4. Deploy the API to Railway

1. In Railway, create a project and add a service from the same Git repository.
2. Keep the service Root Directory at the repository root. Railway will use the committed `railway.json`, which builds and starts only `@healthtracker/api` and checks `/health`.
3. Add these service variables:

   ```text
   NODE_ENV=production
   SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
   SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
   FRONTEND_ORIGIN=https://YOUR_EXACT_VERCEL_PRODUCTION_DOMAIN
   TRUST_PROXY_HOPS=1
   ```

   Do not set `PORT`; Railway supplies it. `FRONTEND_ORIGIN` must contain only one exact HTTPS origin with no path and no trailing slash.

4. Deploy the service and generate a public Railway domain in **Settings → Networking**.
5. Verify the API without authentication:

   ```sh
   curl https://YOUR_RAILWAY_DOMAIN/health
   ```

   It should return a successful health response. Private `/api/v1/*` routes must reject requests without a valid Supabase access token.

## 5. Finish the Vercel deployment

1. Replace the temporary Vercel value with the Railway HTTPS origin:

   ```text
   NEXT_PUBLIC_API_URL=https://YOUR_RAILWAY_DOMAIN
   ```

2. Redeploy the latest production commit. `NEXT_PUBLIC_*` variables are embedded during the frontend build, so changing them requires a new deployment.
3. In Supabase **Authentication → URL Configuration**, set **Site URL** to the exact Vercel production origin. Add only redirect URLs that the application actually uses.
4. Open the production URL, sign in with the approved account, and confirm both profiles load.

## 6. Verify the production system

Use disposable records for this check, then delete them through the UI:

1. Sign in, sign out, and sign back in.
2. Confirm an unauthenticated private URL redirects to `/login`.
3. Create, edit, view, and delete an event for each profile.
4. Upload, open, and delete a document. Confirm its Storage bucket remains private.
5. Rename a profile and upload an avatar.
6. Check Timeline, Calendar, episodes, vaccinations, medical providers, and reminders.
7. In a private browser session, confirm a Storage object URL cannot be opened without authentication.
8. Check Railway and Vercel logs for errors, but never log event content, document metadata, tokens, or other health information.

## 7. Production operating notes

- Vercel preview deployments use different origins. The API intentionally accepts only the single `FRONTEND_ORIGIN`, so previews cannot call the production API unless you deliberately change that production allowlist. Use the stable production domain for health data.
- If the Vercel domain changes, update both Railway `FRONTEND_ORIGIN` and Supabase Auth URL Configuration, then redeploy Railway.
- If the Railway domain changes, update `NEXT_PUBLIC_API_URL` and redeploy Vercel.
- Apply later database changes only as new migration files: review with `npx supabase db push --dry-run`, back up, and then run `npx supabase db push`.
- Enable the Supabase backup/PITR option appropriate for the data. Test a restore procedure before relying on it.
- Keep the Git repository private, require MFA on Supabase, Railway, Vercel, and the Git provider, and restrict project membership.
- The API uses an in-memory rate limiter. Keep one Railway API replica unless that limiter is replaced with a shared store.
