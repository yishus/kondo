# Welcome to React Router!

A modern, production-ready template for building full-stack React applications using React Router.

## Features

- 🚀 Server-side rendering
- ⚡️ Hot Module Replacement (HMR)
- 📦 Asset bundling and optimization
- 🔄 Data loading and mutations
- 🔒 TypeScript by default
- 🎉 TailwindCSS for styling
- 📖 [React Router docs](https://reactrouter.com/)

## Getting Started

### Installation

Install the dependencies:

```bash
npm install
```

### Development

Start the development server with HMR:

```bash
npm run dev
```

Your application will be available at `http://localhost:5173`.

### Database

Initialize or upgrade the local D1 database before starting development:

```bash
bunx wrangler d1 migrations apply DB --local
```

The production schema starts with `migrations/0000_initial.sql`. Migration
`0001_auth_and_trip_owners.sql` adds Better Auth users and shared trip ownership,
`0002_auth_rate_limit.sql` adds persistent authentication rate limits, and
`0003_location_categories.sql` adds optional location-card subcategories.
Migration `0004_expand_location_categories.sql` makes that field extensible,
`0005_location_card_covers.sql` adds uploaded cover-image selection, and
`0006_city_card_locations.sql` adds typed Google places to city/area cards.

Before deploying code that adds database fields, apply its migrations to the
remote database with `bunx wrangler d1 migrations apply DB --remote`.
After the first release, add new numbered migrations rather than editing the
initial migration.

### Authentication and trip owners

Kondo uses Better Auth email/password accounts. Copy `.dev.vars.example` to
`.dev.vars`, generate a secret with `openssl rand -base64 32`, and set it as
`BETTER_AUTH_SECRET`. `BETTER_AUTH_URL` defaults from each request, but setting it
to the app origin is recommended (for example, `http://localhost:5173`).

Account creation is closed beta. Set `CLOSED_BETA_EMAILS` to a comma-separated
list of email addresses that may sign up. Matching ignores email case and
surrounding whitespace. Sign-in remains available to existing accounts, and a
second signup attempt for an existing email is rejected. If
`CLOSED_BETA_EMAILS` is missing or empty, nobody can create an account, but
existing users can still sign in.

Signup is protected by Cloudflare Turnstile and a D1-backed limit of five
attempts per client IP every ten minutes. Create a managed Turnstile widget for
production, set its public key as `TURNSTILE_SITE_KEY`, and store its secret as
`TURNSTILE_SECRET_KEY`. `.dev.vars.example` uses Cloudflare's always-pass test
keys so local and browser tests do not require a production widget. Missing
Turnstile configuration disables signup without disabling sign-in.
Rejected CAPTCHA, allowlist, duplicate-account, and validation attempts all
receive the same public signup error; rate-limited requests retain status `429`
and their retry header.

Every new trip is owned by its creator. An owner can open the Owners panel on a
trip and add another registered account by email; all owners have equal access.
Trip lists, loaders, actions, place search, and file downloads are scoped to the
signed-in user's ownership.

Migration `0001` cannot infer owners for trips that existed before accounts. If
upgrading a database with existing trips, create the intended user accounts and
backfill `trip_owners(trip_id, user_id)` before relying on those trips in the UI.
Migration `0002_auth_rate_limit.sql` adds the persistent rate-limit counters and
must be applied before deploying this protection.

For production, store the auth settings as Worker secrets/variables:

```bash
bunx wrangler secret put BETTER_AUTH_SECRET
bunx wrangler secret put BETTER_AUTH_URL
bunx wrangler secret put CLOSED_BETA_EMAILS
bunx wrangler secret put TURNSTILE_SITE_KEY
bunx wrangler secret put TURNSTILE_SECRET_KEY
```

### Google Maps place search

Copy `.dev.vars.example` to `.dev.vars` and set `GOOGLE_MAPS_API_KEY` to a
server-side key from a Google Maps Platform project with billing and
[Places API (New)](https://developers.google.com/maps/documentation/places/web-service/get-api-key)
enabled. Restrict the key to Places API (New) and configure a suitable quota in
Google Cloud. Restart the dev server after changing `.dev.vars`.

Set `GOOGLE_MAPS_BROWSER_API_KEY` to a separate browser key for interactive
train and subway route previews and city/area location maps. A
[Maps Demo Key](https://developers.google.com/maps/documentation/javascript/demo-key)
is suitable for local development. Standard browser keys need Maps JavaScript,
Places API (New), and Routes API access plus an HTTP referrer restriction. Route previews run
only when the user requests one, use the transport card's trip day and departure
or arrival time, and currently interpret that time in the browser's time zone.

For deployment, set the Worker secret with `bunx wrangler secret put GOOGLE_MAPS_API_KEY`.
The key is never sent to the browser. Search runs when the user clicks Search or
presses Enter in the location field, using Text Search (New) with five results and
only names, addresses, IDs, and attribution. Cards store the selected place ID
and the user's search text; search result names and addresses are not stored.
City/area cards can store multiple selected places. Each place has a free-form
type, with Restaurants, Coffee, and Interest offered as suggestions. Their map
uses type-colored Advanced Markers and fetches coordinates from the saved Place
IDs in the browser rather than storing Google coordinates.
Location cards without an uploaded cover request the first available Places
photo only as the card approaches the viewport. Photo references and
short-lived URLs are neither stored nor cached; the card links directly to the
source photo on Google Maps for attribution. Links use Google's
[Maps URL format](https://developers.google.com/maps/documentation/urls/get-started).
Without a key, cards and existing Maps links still work, while search shows an
unavailable message and Google photo covers remain empty. Location fields are
included in the initial migration.

### Accommodations

The Accommodations tab groups hotel and Airbnb candidates by city, area, or
region. Each candidate can have multiple check-in/check-out options with a total
price and currency; nightly prices use the number of nights excluding check-out.
Select a date option to confirm a stay. Booking details include the booking
platform, notes, and free cancellation deadline with an explicit IANA time zone
(for example, `Asia/Tokyo`). Each candidate can have one booking PDF, up to 10 MB,
with replacement, download, and removal available in its editor.

Accommodation tables are included in the initial migration. This tab uses the
existing Google Places configuration and ATTACHMENTS
R2 bucket. As with itinerary locations, the app stores the place ID and your
search text; Google result addresses are displayed during selection, with a Maps
link available afterward. Date options and booking details save together with
PDF metadata; Cancel discards unsaved edits.

Run `bun test tests/accommodations.test.ts` for date and booking validation, and
`bunx playwright test tests/browser/accommodations.e2e.ts` against the isolated
local server described below for the complete booking flow.

### Notes

The Notes tab has a per-trip to-do list and a free-form notes field. Add tasks,
check them off, or delete them; task changes save immediately. Use Save notes to
save the text field. Notes and to-do tables are included in the initial migration.

### Verification

Cards support up to five JPG/JPEG or PDF attachments, 10 MB each. Attachments are
uploaded or removed when the card is saved; Cancel discards pending changes.
Location cards can select one saved or newly selected JPG as their cover image;
PDF files cannot be covers. An uploaded cover takes priority over the Google
Places photo fallback.
File bytes use the `ATTACHMENTS` R2 binding and metadata uses D1. With the local
dev server, both are persisted under `.wrangler/state`; no bucket creation or
cloud credentials are needed. Apply local migrations and restart the dev server
after adding the binding. Files are served through trip/card-scoped routes.

Remote deployment requires an R2 bucket named `kondo-attachments` and the initial
D1 migration. Local file bytes and data are not automatically copied by deployment.

```bash
bun test tests/*.test.ts
bun run typecheck
bun run build
```

Each day contains a single ordered list of cards:

- **Location**: title, optional subcategory (Place of interest, Food, or Hike),
  description, Google Maps location, and attachments.
- **City / area / region**: a name plus multiple typed Google places displayed
  together on a color-coded map, independently movable like any other card.
- **Transport**: mode (including train and subway), start and end locations, with
  optional times, service number, notes, and attachments.

Choose a type when adding a card. Drag any card with a mouse or touch. For
keyboard movement, focus its handle, press Space, use up/down to choose a
position or left/right to change columns, then press Space to drop. Escape
cancels. Unscheduled holds cards that do not have a day yet.

The initial schema stores location, city, and transport cards in one table. The
old city-group table remains for compatibility with the current Drizzle schema;
the board no longer uses it.

Browser tests use Chrome and create test trips. Run them against an isolated
local database. In one terminal:

```bash
bun run build
drag_test_state=$(mktemp -d)
bunx wrangler d1 migrations apply DB --local --persist-to "$drag_test_state"
bunx wrangler dev --config build/server/wrangler.json --local --persist-to "$drag_test_state" --port 5174
```

In another terminal, run `bunx playwright test`. Stop the test server with Ctrl-C
when finished. Set `PLAYWRIGHT_BASE_URL` to use a different test server. The
local `CLOSED_BETA_EMAILS` list must include `browser-test@example.com`,
`owner@example.com`, and `coowner@example.com`; `.dev.vars.example` includes all
three.

## Previewing the Production Build

Preview the production build locally:

```bash
npm run preview
```

## Building for Production

Create a production build:

```bash
npm run build
```

## Deployment

Deployment is done using the Wrangler CLI. Before the first deployment, ensure
the configured D1 database is empty, create the `kondo-attachments` R2 bucket if
needed, and apply the initial migration:

```sh
bunx wrangler d1 migrations apply DB --remote
```

Set `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `TURNSTILE_SITE_KEY`,
`TURNSTILE_SECRET_KEY`, and optionally `CLOSED_BETA_EMAILS` and
`GOOGLE_MAPS_API_KEY` with
`bunx wrangler secret put <NAME>`. Leaving `CLOSED_BETA_EMAILS` unset disables
new account creation without disabling sign-in. Start production with an empty
database; deployment does not copy development users, trips, or attachments.

To build and deploy directly to production:

```sh
npm run deploy
```

To deploy a preview URL:

```sh
npx wrangler versions upload
```

You can then promote a version to production after verification or roll it out progressively.

```sh
npx wrangler versions deploy
```

## Styling

This template comes with [Tailwind CSS](https://tailwindcss.com/) already configured for a simple default starting experience. You can use whatever CSS framework you prefer.

---

Built with ❤️ using React Router.
