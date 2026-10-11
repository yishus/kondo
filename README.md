# Kondo

Kondo is a trip planner for type A travelers.

## Deploy your own version

You need [Bun](https://bun.sh/), Node.js, and a Cloudflare account with Workers, D1, and R2 available. Optional integrations use your own provider accounts and billing. Your deployment has its own database, files, users, and credentials.

### 1. Prepare the configuration

Fork or clone this repository. From the project folder, copy the template **before installing dependencies**:

```bash
cp wrangler.jsonc.example wrangler.jsonc
bun install
bunx wrangler login
```

The default Worker name is `kondo`. Change `name` in `wrangler.jsonc` if you already have a Worker with that name in your account. Keep the application binding names `DB` and `ATTACHMENTS` unchanged.

### 2. Create your database and file bucket

```bash
bunx wrangler d1 create kondo-db
bunx wrangler r2 bucket create kondo-attachments
```

Replace `REPLACE_WITH_YOUR_D1_DATABASE_ID` in `wrangler.jsonc` with the ID returned by the database command. If you choose different resource names, update `database_name` and `bucket_name` too.

Keep the R2 bucket private: leave its public `r2.dev` URL disabled and do not attach public bucket custom domains. Files are served through the app's authenticated routes. The template's `remote: false` selects local storage during development; it does not control bucket privacy.

### 3. Configure authentication

Determine your app URL, normally `https://<worker-name>.<your-workers-subdomain>.workers.dev`. Find your Workers subdomain in the Cloudflare dashboard, or use your intended custom domain.

[Create a managed Turnstile widget](https://developers.cloudflare.com/turnstile/get-started/widget-management/) and allow your app's hostname. Generate a fresh authentication secret:

```bash
openssl rand -base64 32
```

Set these values using the commands below. Each command prompts for its value. If Wrangler offers to create the Worker while adding the first secret, accept.

| Setting                | Value                                                                |
| ---------------------- | -------------------------------------------------------------------- |
| `BETTER_AUTH_SECRET`   | The generated secret; use a different secret for each installation.  |
| `BETTER_AUTH_URL`      | Your full app origin, including `https://`.                          |
| `CLOSED_BETA_EMAILS`   | Your email and any other allowed signup emails, separated by commas. |
| `TURNSTILE_SITE_KEY`   | Your widget's public site key.                                       |
| `TURNSTILE_SECRET_KEY` | Your widget's secret key.                                            |

```bash
bunx wrangler secret put BETTER_AUTH_SECRET
bunx wrangler secret put BETTER_AUTH_URL
bunx wrangler secret put CLOSED_BETA_EMAILS
bunx wrangler secret put TURNSTILE_SITE_KEY
bunx wrangler secret put TURNSTILE_SECRET_KEY
```

Signup requires both the email allowlist and Turnstile configuration. The Turnstile keys in `.dev.vars.example` are for local testing only.

### 4. Enable optional integrations

Skip any integrations you do not need. Add each key with `bunx wrangler secret put <NAME>`:

| Key                           | Enables                                                                 | Provider setup                                                                                                                 |
| ----------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `OPENAI_API_KEY`              | Card and trip chat, web search, and suggested cards.                    | API billing and access to the configured model, currently `gpt-6-sol`.                                                         |
| `TYPESAFE_API_KEY`            | AI activity categorization for day timing.                              | A TypeSafe API account.                                                                                                        |
| `GOOGLE_MAPS_API_KEY`         | Place search, Google photo covers, and server-side transport estimates. | Enable Places API (New) and Routes API; restrict the key to those APIs.                                                        |
| `GOOGLE_MAPS_BROWSER_API_KEY` | Google place lookups on maps and interactive route previews.            | Enable Maps JavaScript API, Places API (New), and Routes API; restrict the key to your app's HTTP referrers and required APIs. |
| `THUNDERFOREST_API_KEY`       | Outdoors tiles in the hike map's layer picker.                          | A Thunderforest API account.                                                                                                   |

Google browser and Thunderforest keys are visible in the browser. OpenAI, TypeSafe, and the Google server key stay on the server. AI features send relevant card or trip context to their providers when used.

### 5. Deploy and create your account

```bash
bun run deploy
```

This builds the app, applies all pending D1 migrations to your remote database, and deploys the Worker. Open the URL printed by Wrangler and sign up with an allowlisted email. Other people must create an account on your deployment before you can add them as trip owners in **Settings**.

For future updates, pull the latest code, run `bun install`, then run `bun run deploy` again. Your ignored `wrangler.jsonc` remains your deployment configuration. Local development data and files are not copied to production.

Store production credentials as [Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/). For local development, copy [.dev.vars.example](.dev.vars.example) to `.dev.vars`. The local Wrangler configuration and secret files are ignored by Git; keep filled-in credentials out of templates and source control.
