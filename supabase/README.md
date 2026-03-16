# Supabase Setup

This repo only needs two Supabase values in the frontend:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Do not put the service-role/secret key or the direct database password in this repo.

## 1. Create local env file

Create a local `.env` file in the project root using `.env.example` as the template:

```bash
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-supabase-publishable-key
```

`.gitignore` now ignores `.env` and `.env.*`, while still allowing `.env.example`.

## 2. Run the database schema

Open the Supabase dashboard for your project:

- `SQL Editor`
- create a new query
- paste in [`schema.sql`](./schema.sql)
- run it once

That creates:

- `profiles`
- `modules`
- `module_ratings`
- `module_subscriptions`

It also creates:

- RLS policies on every table
- a signup trigger that creates a profile row automatically
- rating/subscription counter triggers on `modules`

## 3. Set up Google login

In Supabase:

- `Authentication`
- `Providers`
- enable `Google`

You will need a Google OAuth client from Google Cloud. In Google Cloud:

- create an OAuth client for `Web application`
- add your Supabase callback URL from the provider setup screen as an authorized redirect URI

Then back in Supabase:

- paste the Google client ID
- paste the Google client secret
- save

## 4. Set auth URLs

In Supabase:

- `Authentication`
- `URL Configuration`

Set these values for local development and production:

- Site URL: `http://localhost:3000`
- Redirect URLs:
  - `http://localhost:3000/**`
  - `https://dunninganddragons.com/phosphor/**`

If you deploy somewhere else later, add that origin too.

## 5. Recommended first queries to test

After signing in with Google from the app, these should work from the browser client:

- insert a row into `modules` with `owner_id = auth.uid()`
- select public rows from `modules`
- select the signed-in user's rows from `module_subscriptions`

These should fail:

- inserting a module for another user
- reading another user's subscriptions
- using the secret key in frontend code

## 6. Suggested next implementation slice

Build the modules feature in this order:

1. Auth state and Google sign-in/out
2. Create/save private modules
3. Publish a module and load it by URL
4. Browse public modules
5. Subscribe/unsubscribe
6. Rate public modules

## Notes

- Module IDs are UUIDs right now. That is enough for shareable URLs like `?module=<uuid>`.
- The schema stores the script as `jsonb`, which is ideal for the current JSON-only phase.
- Asset upload can be added later with Supabase Storage or another object store.
