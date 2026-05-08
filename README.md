# SRED Airtable POC

Three part Airtable integration: REST based sync, a scraper to retrieve revision history, and UI to display

## Structure

- **API** (`apps/api`) — Express + TypeScript. Airtable OAuth (PKCE), REST pagination, BullMQ scraper, socket.io for realtime scrape progress
- **Web** (`apps/web`) — Angulard + Material
- **Shared** (`libs/shared`) — zod contracts and TS types used across the monorepo
- **Seed** (`tools/seed-airtable`) — script that populates a airtable base

## Stack

- Node 22, pnpm workspaces
- Express 4, mongoose 8, redis, BullMQ 5
- Playwright 1.49
- zod, pino for logging, `@noble/ciphers` for encryption of session cookies
- Angular 19, AG Grid, socket.io

## Getting started

```bash
nvm use
pnpm install
cp .env.example .env       # then fill DATA_ENCRYPTION_KEY + Airtable creds
docker compose up -d       # Mongo + Redis
```

Generate the DATA_ENCRYPTION_KEY and copy it into `.env`

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### Airtable setup

1. Sign in at <https://airtable.com>, create a new workspace if needed, and add an empty base. Copy the base id from the URL (the`appXXX` segment in `https://airtable.com/appXXXX/..`) into `.env` as `SEED_AIRTABLE_BASE_ID`

2. Register an OAuth integration at <https://airtable.com/create/oauth>:

- Name: `SRED POC`
- Redirect URL: `http://localhost:3300/api/airtable/oauth/callback`
- Scopes: `data.records:read`, `schema.bases:read`, `user.email:read`
- Copy the Client ID and Secret into `.env`.

3. For the seed script, create a personal access token at <https://airtable.com/create/tokens>

- Name: `SRED POC Seed`
- Permissions `schema.bases:write, schema.bases:write, data.records:write, data.records:write`
- Scope: test base previously created
- Copy token into `.env` as `SEED_AIRTABLE_PAT`.

Then run: `pnpm --filter @sred/seed-airtable start`

4. Start the app with `pnpm dev`,

5. Connect to Airtable Oauth and sync

- Open <http://localhost:4200> and click **Connect** to authorize Airtable.
- Navigate to Explorer and Sync from Airtable

6. Scrape activity history

- Navigate to connect and initiate Sign in via browser.
  If for some reason a SSO provider doesn't want to auth through the browser window, you can set a password in https://airtable.com/account and auth with username/password instead.
- Once logged in, navigate back to Explorer and Scrape revisions

## Environment

| Var                            | Purpose                                              |
| ------------------------------ | ---------------------------------------------------- |
| `MONGO_URI`                    | Mongo connection string                              |
| `REDIS_URL`                    | Redis connection string                              |
| `DATA_ENCRYPTION_KEY`          | 32 raw bytes, base64. Encrypts OAuth tokens, cookies |
| `AIRTABLE_OAUTH_CLIENT_ID`     | From the OAuth integration                           |
| `AIRTABLE_OAUTH_CLIENT_SECRET` | Same                                                 |
| `AIRTABLE_OAUTH_REDIRECT_URI`  | Must match what's registered with Airtable           |
| `AIRTABLE_SCRAPER_HEADLESS`    | `true` (default) or `false` to watch the popup       |
| `WEB_ORIGIN`                   | CORS allow-list; default `http://localhost:4200`     |

## Tests

```bash
pnpm test
```

## Notes

- **Scraper login is a visible Chrome popup**. At first I tried a headless email/password flow, but Airtable was detecting a bot and blocking Playwright.
  There is a chrome popup that the user has to interact with to log in and authorize the app, and on navigation to a workspace we grab the cookie.
  There's also an option to manually paste a Cookie as bot detection still pops up from time to time.
- **Tokens and session cookies** are stored encrypted as good practice.
- **Single Tenant** There a fixed default id used for demo, but Architected to be easily transitioned to multi tenant

## Out of scope

I spent more time trying to have a clean architecture that could be extendable especially in the backend.
Due to time constraints, I left some things out of scope

- **No pagination on records table.** We'd want backend pagination, filters, sorting in a real application.
- **No cursor pagination on the activity scraper.** The scraper fetches the first 100 activities per row and stops.
- **Potentially deletion propagation.** Sync is upsert only. records removed in Airtable persist in Mongo until overwritten.
- **Tests are unit-only.** Tests could more extensive. No integration tests or Playwright E2E tests.
