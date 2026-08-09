# eats

A small, mobile-first calorie and protein tracker built with Next.js and Supabase. Accounts, food entries, and goals sync securely between devices.

## Run locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

Create a Supabase project, open its SQL Editor, and run the migrations in order:

1. `supabase/migrations/20260808000000_initial_schema.sql`
2. `supabase/migrations/20260809000000_meals_and_routines.sql`

Copy the project URL and publishable key from **Project Settings → API Keys** into `.env.local`, then open `http://localhost:3000`.

In Supabase, open **Authentication → URL Configuration** and set:

- Site URL: your production Vercel URL
- Additional redirect URL: `http://localhost:3000/**`
- For Vercel previews, also add `https://*-YOUR-VERCEL-TEAM.vercel.app/**`

The app uses passwordless magic links. Entering a new email creates its account; returning users receive a single-use sign-in link.

## Test accounts

No test account is created automatically. To make one without needing another Gmail inbox, sign in with a plus alias:

```text
Real account: monsieurcheri@gmail.com
Test account: monsieurcheri+eats-test@gmail.com
```

The magic link for the test account arrives in the normal `monsieurcheri@gmail.com` inbox, but Supabase treats the alias as a separate user with completely separate food entries and goals.

## Deploy to Vercel

Import this repository in Vercel and keep the detected Next.js defaults. Add `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `NEXT_PUBLIC_SITE_URL` under **Project Settings → Environment Variables**. Set `NEXT_PUBLIC_SITE_URL` to the final production URL.

## Add it to an iPhone home screen

After deployment, open the site in Safari, tap **Share**, choose **Add to Home Screen**, then tap **Add**.

## Security

Supabase Row Level Security is enabled on both tables. Authenticated users can only read or change rows whose `user_id` matches their account. Never expose a Supabase secret key in this app; only use the publishable key. The legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` variable remains a compatibility fallback in code but should not be used for new setup.
