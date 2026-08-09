# eats

A mobile-first calorie and macro tracker built with Next.js and Supabase. It tracks calories, protein, carbohydrates, and fat, with private cloud sync between devices.

## Current features

- Passwordless magic-link accounts
- Daily calorie and macro goals
- Daily food logging for today or earlier dates
- Expandable food-log entries with full nutrition and saved ingredient details
- Confirmation before deleting a food log
- Calendar history across months and years
- Ingredient library with brands, serving measurements, and barcode values
- Full-screen live barcode scanner using Open Food Facts
- Automatic loading of previously verified barcode nutrition from your library
- Interchangeable kcal and kJ input while storing energy consistently as kcal
- Automatic macro recalculation when an ingredient amount changes
- Searchable meal builder that separates ingredient selection from measurements
- Add a missing ingredient without losing the current meal draft
- Reusable meals made from multiple ingredients
- Reusable routines made from multiple meals
- Mobile previews for ingredients, meals, and routines
- Edit ingredients, meals, and routines
- Create meal and routine variants without changing the original
- Log a meal or an entire routine to today or an earlier date
- Time-based routine suggestions based on previous usage
- Installable iPhone home-screen experience

Barcode nutrition comes from the free Open Food Facts database. Some products have incomplete public records. When that happens, enter the package values manually and save the ingredient. Eats associates those values with the barcode in your Supabase account, so later scans reuse them.

Nutrition-label photo/OCR capture was intentionally removed because reliable extraction would require more advanced AI and potentially paid API usage.

## Run locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

Create a Supabase project and copy the project URL and publishable key from **Project Settings → API Keys** into `.env.local`:

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

The current Supabase key is called the **publishable key**. Do not use a secret key in browser code. The legacy anon-key variable remains only as a compatibility fallback.

Apply the database migrations with the linked Supabase CLI project:

```bash
npx supabase db push
```

Alternatively, run these files in the Supabase SQL Editor in order:

1. `supabase/migrations/20260808000000_initial_schema.sql`
2. `supabase/migrations/20260809000000_meals_and_routines.sql`

Then open `http://localhost:3000`.

## Supabase authentication

In Supabase, open **Authentication → URL Configuration** and configure:

- Site URL: the final Vercel URL in production
- Additional redirect URL: `http://localhost:3000/**`
- Vercel previews: `https://*-YOUR-VERCEL-TEAM.vercel.app/**`
- Temporary phone testing: the HTTPS ngrok address followed by `/**`

Entering a new email creates an account. Returning users receive a single-use magic link.

## Test account

No test account is created automatically. Use a Gmail plus alias to keep test data separate:

```text
Real account: monsieurcheri@gmail.com
Test account: monsieurcheri+eats-test@gmail.com
```

The test-account magic link arrives in the normal `monsieurcheri@gmail.com` inbox, but Supabase treats the alias as a separate user with separate meals, routines, logs, and goals.

## Test on an iPhone before deployment

Run Next.js so it is reachable outside localhost:

```bash
npm run dev -- --hostname 0.0.0.0
```

In another terminal, expose it with ngrok:

```bash
ngrok http 3000
```

Add the ngrok HTTPS URL to the Supabase redirect allowlist, then open it in Safari. Camera access requires HTTPS. If Safari has cached an older build, close the tab and reopen the URL.

## Deploy to Vercel

Import this repository in Vercel and keep the detected Next.js settings. Add these environment variables:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
NEXT_PUBLIC_SITE_URL
```

Set `NEXT_PUBLIC_SITE_URL` to the final production URL and add that URL to Supabase Authentication settings.

## Add Eats to an iPhone home screen

After deployment, open Eats in Safari, tap **Share**, select **Add to Home Screen**, and tap **Add**.

## Planned ChatGPT connection

The ChatGPT work is intentionally scheduled after the main app is finished and deployed. The plan is to add a private Eats MCP server to this same Next.js/Vercel project.

Initial ChatGPT tools will include:

- View daily totals and food logs
- List saved meals and routines
- Log a saved meal to a selected date
- Log a saved routine to a selected date

ChatGPT will never receive a Supabase secret key or unrestricted database access. A one-time account-linking flow will connect ChatGPT to the correct Eats user. Write actions will be limited to the tools Eats explicitly exposes.

### Test MCP locally before deployment

Deployment is not required for initial MCP development:

1. Run Eats locally.
2. Test the local `/mcp` route with MCP Inspector.
3. Test tool inputs, outputs, authentication, and Supabase writes locally.
4. Use ngrok when ChatGPT itself needs to reach the local server over HTTPS.
5. Deploy to Vercel only after the local tools work correctly.

Planned local commands:

```bash
npm run dev
npx @modelcontextprotocol/inspector@latest
ngrok http 3000
```

The future local MCP URL will be `http://localhost:3000/mcp`. Through ngrok it will be `https://YOUR-NGROK-DOMAIN/mcp`. The `/mcp` route has not been implemented yet.

## Security

Supabase Row Level Security is enabled for profiles, food entries, ingredients, meals, meal ingredients, routines, and routine meals. Authenticated users can only access rows associated with their account.

Never expose a Supabase secret key in client-side code or commit environment files containing credentials.
