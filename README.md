<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="public/eats-logo-white.png" />
    <source media="(prefers-color-scheme: light)" srcset="public/eats-logo.png" />
    <img src="public/eats-logo.png" alt="Eats logo" width="120" />
  </picture>
</p>

<h1 align="center">Eats</h1>

<p align="center">
  A premium, mobile-first food log for calories and macros.
</p>

Eats is a Next.js and Supabase food tracker with private cloud sync, a personal meal library, barcode capture, and a ChatGPT-ready MCP connection.

## Current features

- Password-free email-code accounts with cloud sync
- Daily calorie, protein, carbohydrate, and fat tracking
- Calendar history and logging for past dates
- Reusable ingredients, meals, routines, and variants
- Live barcode scanning with automatic nutrition lookup
- Quick logging from a new entry or a saved library meal
- A visible Sync control for installed iPhone home-screen apps
- Review-before-logging tools for ChatGPT via MCP
- Mobile-first iOS-inspired design installable on an iPhone home screen

Barcode nutrition comes from the free Open Food Facts database. Some products have incomplete public records. When that happens, enter the package values manually and save the ingredient. Eats associates those values with the barcode in your Supabase account, so later scans reuse them.

Eats does not require an OpenAI API key. ChatGPT can analyse a food photo or meal description, then writes to Eats only after the user explicitly approves the reviewed estimate.

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

Entering a new email creates an account. Returning users enter the eight-digit code sent by the project's Supabase email template. This works inside an installed iOS home-screen app, where a mail link can otherwise open Safari instead of Eats.

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

## ChatGPT MCP connection

The production MCP server is:

```text
https://eats-rho.vercel.app/mcp
```

It uses the signed-in person's Supabase OAuth token and Row Level Security. It does not expose Supabase secrets or require an OpenAI API key.

### Configure Supabase

1. In **Authentication → OAuth Server**, enable the Supabase OAuth Server.
2. Set the Site URL to `https://eats-rho.vercel.app`.
3. Set the authorization path to `/oauth/consent`.
4. Enable **Allow Dynamic OAuth Apps** so compatible MCP clients can register their own secure connection.

### Connect in ChatGPT

1. Open **Settings → Apps / Plugins** in ChatGPT.
2. Create a custom app/connector with `https://eats-rho.vercel.app/mcp`.
3. Connect an Eats account once, enter the emailed eight-digit code, and approve the Eats consent screen.
4. In a normal ChatGPT conversation, select Eats, upload a meal photo or describe food, review the nutrition estimate, then explicitly approve logging it.

Available tools:

- `get_daily_totals` and `get_food_log`
- `list_meals` and `list_routines`
- `log_food` for an approved photo or text estimate
- `log_saved_meal` and `log_saved_routine`

Write tools are marked as non-read-only and should run only after a clear user approval. Custom-app availability depends on the ChatGPT account, workspace, region, and interface.

### Legacy Custom GPT Action

The deployed OpenAPI schema remains available at:

```text
https://eats-rho.vercel.app/.well-known/eats-gpt-openapi.json
```

It is retained for compatibility. The MCP app route is the preferred connection model for current ChatGPT testing; a custom GPT should use an app/plugin or an Action, not both.

### Test MCP locally

1. Run Eats locally and sign in.
2. Open `http://localhost:3000/mcp-test` and copy the temporary test token.
3. Run the MCP Inspector:

   ```bash
   npx @modelcontextprotocol/inspector@latest
   ```

4. Add a Streamable HTTP server at `http://localhost:3000/mcp` with `Authorization: Bearer YOUR_COPIED_TOKEN`.
5. Test authentication, tool inputs, tool results, and write approval behaviour.

For a remote client, expose the local server through HTTPS with `ngrok http 3000` and use the ngrok URL plus `/mcp`. Treat copied tokens like passwords; do not commit or share them.

## Security

Supabase Row Level Security is enabled for profiles, food entries, ingredients, meals, meal ingredients, routines, and routine meals. Authenticated users can only access rows associated with their own account.

The MCP and reviewed-meal endpoints validate a supplied Supabase bearer token before querying or inserting data.

Never expose a Supabase secret key in client-side code or commit environment files containing credentials.
