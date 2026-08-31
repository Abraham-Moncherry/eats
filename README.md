<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="public/eats-logo-white.png" />
    <source media="(prefers-color-scheme: light)" srcset="public/eats-logo.png" />
    <img src="public/eats-logo.png" alt="Eats logo" width="120" />
  </picture>
</p>

<h1 align="center">eats</h1>

<p align="center">
  A simple, mobile-first calorie and macro tracker.
</p>

A mobile-first calorie and macro tracker built with Next.js and Supabase. It tracks calories, protein, carbohydrates, and fat, with private cloud sync between devices.

## Current features

- Private magic-link accounts with cloud sync
- Daily calorie, protein, carbohydrate, and fat tracking
- Calendar history and logging for past dates
- Reusable ingredients, meals, routines, and variants
- Live barcode scanning with automatic nutrition lookup
- ChatGPT-ready, review-before-logging meal action
- Mobile-first design installable on an iPhone home screen

Barcode nutrition comes from the free Open Food Facts database. Some products have incomplete public records. When that happens, enter the package values manually and save the ingredient. Eats associates those values with the barcode in your Supabase account, so later scans reuse them.

Food photo and description analysis belongs in the Eats GPT inside ChatGPT. Eats does not require an OpenAI API key: it only receives a reviewed meal after the user explicitly approves it in the ChatGPT conversation.

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

## Eats GPT connection

Eats includes two secure connection surfaces, both using the signed-in user's Supabase OAuth token and existing Row Level Security policies. Neither uses an OpenAI API key or Supabase secret key.

### Custom GPT Action (the phone-first flow)

Create an Eats GPT in ChatGPT and add an OAuth Action using this OpenAPI schema after deploying Eats:

```text
https://YOUR-EATS-DOMAIN/.well-known/eats-gpt-openapi.json
```

Use OAuth authorization and token URLs from your Supabase project:

```text
https://YOUR-PROJECT.supabase.co/auth/v1/oauth/authorize
https://YOUR-PROJECT.supabase.co/auth/v1/oauth/token
```

In the GPT instructions, require this flow: analyse the uploaded photo or written description; state that calories and macros are an estimate; show the proposed meal and category; ask for an explicit approval; only then call `logReviewedMeal`.

Before it can connect, enable **Authentication → OAuth Server** in Supabase, set the authorization path to `/oauth/consent`, and register the exact callback URL shown in the GPT Action editor as a confidential OAuth client. The built-in Eats consent screen lets each user link only their own account.

### MCP (desktop testing)

The `/mcp` server still provides totals, logs, saved meals, saved routines, and write tools. It now publishes OAuth protected-resource metadata so compatible clients can discover the Supabase OAuth server.

### Test MCP locally before deployment

Deployment is not required for initial MCP development:

1. Run Eats locally.
2. Sign in to Eats and open `http://localhost:3000/mcp-test`.
3. Copy the temporary test token.
4. Test the local `/mcp` route with MCP Inspector.
5. Test tool inputs, outputs, and authentication locally.
6. Use ngrok when ChatGPT itself needs to reach the local server over HTTPS.
7. Deploy to Vercel only after the local tools work correctly.

Planned local commands:

```bash
npm run dev
npx @modelcontextprotocol/inspector@latest
ngrok http 3000
```

In Inspector, use Streamable HTTP with URL `http://localhost:3000/mcp`. Add an `Authorization` header whose value is `Bearer YOUR_COPIED_TOKEN`. Through ngrok, the endpoint is `https://YOUR-NGROK-DOMAIN/mcp`.

The copied token is temporary and should be treated like a password. Do not commit or share it. If Inspector reports that it expired, revisit `/mcp-test` and copy a fresh token.

Connecting the deployed server directly to ChatGPT will require an OAuth account-linking layer. That production step is intentionally deferred until the app and local MCP tools are working.

## Security

Supabase Row Level Security is enabled for profiles, food entries, ingredients, meals, meal ingredients, routines, and routine meals. Authenticated users can only access rows associated with their account.

Never expose a Supabase secret key in client-side code or commit environment files containing credentials.
