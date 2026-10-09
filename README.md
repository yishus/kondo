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
Migration `0007_hike_details.sql` adds optional hike distance (km) and elevation
gain (m), shown below the title on hike cards.
Migration `0008_todo_owners.sql` adds optional trip-owner tags to to-do tasks.
Migration `0009_transport_estimate.sql` stores Google Maps travel-time estimates
on transport cards. Saving a card with a departure or arrival time refreshes the
estimate using its trip day and effective time zone (day override, then trip
default, then the saving device's time zone if neither is set). Enable **Routes
API** for the server-side `GOOGLE_MAPS_API_KEY` (the browser key is not used).
Train, subway, tram, and bus estimates use the departure time, or arrival time
when departure is empty. Car/taxi estimates use departure-time traffic when
possible; arrival-only or past driving times use a labeled general estimate.
Walking is also supported. Flights, ferries, and unspecified modes are not
estimated. Missing routes, API errors, and a six-second timeout do not prevent
the card from saving. Moving a card to another date hides its old estimate until
the next save. Changing its effective time zone also hides the old estimate.

Migration `0015_transport_place_names.sql` stores the short Google place names
separately from transport addresses. Card titles use those names while routing
keeps the full addresses. Reselect the endpoints on older cards to use short names.

Migration `0012_trip_day_timezones.sql` adds optional named time zones to trips
and days. Create a trip with just its title, then set its default zone in the
trip's **Settings** tab. New days inherit this default. Choose **Set time zone** from a day's
three-dot menu to change it in a small dialog. Clearing a day override restores the trip default. Existing
trips and days start unset; changing a zone leaves entered clock times unchanged.
Use names such as `Asia/Tokyo` or `America/New_York` so daylight saving follows
the trip date. Route calculations decline nonexistent or repeated local times
during clock changes instead of guessing. Separate departure/arrival time zones
and arrival dates for travel across zones are not yet supported.

Before deploying code that adds database fields, apply its migrations to the
remote database with `bunx wrangler d1 migrations apply DB --remote`.
Migration `0020_trip_attachments.sql` adds trip-level files in the **Notes** tab.
Trip owners can upload, open, download, and remove JPG, PNG, and PDF files
(up to five per upload, 10 MB per file).
Migration `0014_day_estimates.sql` adds saved day timing snapshots. Click
**Refresh times** in the three-dot menu to the left of a day's card count to estimate
clock times between cards.
Durations written in titles/descriptions, entered transport times, saved route
estimates, and hike distance/elevation are handled in code. For location cards
without a written duration, Jev chooses café/snack (30 min), meal (60 min),
museum/gallery (90 min), or other/unclear (60 min). Add transport
cards to account for travel between stops. Timing starts at 09:00 unless a
scheduled transport provides an anchor, and uses the day/trip zone or the device
zone supplied at refresh. Each label shows its reasoning on hover.
Snapshots survive reloads, edits, additions, and deletions; only this
button recalculates them. Moving or reordering a card removes that card's saved
label without recalculating other times. City/area/region cards consume no time
and receive no time labels. Labels for deleted cards remain near the next surviving
card (or at the end), until refresh. Refreshing an empty day clears its labels.

To enable Jev, set `TYPESAFE_API_KEY` in `.dev.vars` and restart the local server.
For production, store it with `bunx wrangler secret put TYPESAFE_API_KEY`.
The key stays server-side. Refresh sends eligible cards' titles (up to 300
characters), descriptions (2,000 characters), selected subcategories, and Maps
search text (300 characters) to the
[TypeSafe Choice API](https://docs.typesafe.ai/primitives/choice) using
`jev-latest`. No attachments or account information are sent. Questions are batched
eight at a time with at most two concurrent calls and an eight-second deadline
for the whole refresh. There are no background calls or automatic retries.
The chosen category, confidence, probability distribution, and model version
are saved in the timing snapshot; the card's manually chosen subcategory is not
changed. The winning category supplies a planning default without a confidence
cutoff; domain accuracy has not yet been calibrated. Missing configuration,
service errors, timeouts, and invalid answers use the existing local rules.
The fallback reason is retained in the saved snapshot. Explicit durations always
take priority.

After the first release, add new numbered migrations rather than editing the
initial migration.

### Card chat with Sol and web search

Saved location, hike, city/area, and transport cards have a **Chat** tab in their
modal (on both the board and map). It uses `gpt-6-sol` through the
[OpenAI Responses API with web search](https://developers.openai.com/api/docs/guides/tools-web-search).

Apply migration `0017_card_chats.sql` using the migration command above. Set
`OPENAI_API_KEY` in `.dev.vars` and restart development. For production, apply
the remote migration and run `bunx wrangler secret put OPENAI_API_KEY` before
deploying. The key needs access to GPT-6 Sol and API billing; it stays on the
server. Without it, the Chat tab explains that chat is not configured.

Each trip owner has their own saved conversation per card. Only an authenticated
owner can read or send messages. Deleting a card or account deletes its chats.
**New chat** clears that user's conversation. Conversations allow 20 exchanges;
after that, start a new chat. Requests are limited to ten per user per minute,
one pending request per conversation, and a 90-second API timeout. Failed calls
keep the prior conversation and leave the question in the composer for retry.

Every question sends the current saved card details, trip title/description,
scheduled date, time zone, saved timing estimate, and conversation to OpenAI.
City cards include their places; hikes include a compact GPX summary with route
coordinates, distance and elevations. Other attachment contents are not sent.
Save card edits before asking about them. Chats are saved in D1; API response
storage is disabled with `store: false`. Calls only run when a user sends a
question or chooses a suggested prompt; there are no background AI calls.

For example, choose **Give me a route report for this hike on the planned day
and time**. Sol can search for weather, closures, access, and trail conditions,
and displays clickable inline citations and source links. Saved times are
labeled as estimates. It asks about missing dates/times/zones, and is instructed
to distinguish forecasts for the actual hike date from seasonal guidance or
historical observations when no date-specific forecast exists.

Run the focused mocked-API checks with `bun test tests/card-chat.test.ts`.
After a build, run the isolated browser checks with
`bunx playwright test tests/browser/card-chat.e2e.ts`. These do not call OpenAI.

### Trip chat on the map

The Map tab has an **Ask about this trip** panel using the same server-side
`OPENAI_API_KEY` and model as card chat. Apply `0018_trip_chats.sql` before running
this version. Each owner gets a private saved conversation for the whole trip.

Ask for places, food stops, hikes, or transport ideas. Sol returns proposed cards
using [structured function calls](https://developers.openai.com/api/docs/guides/function-calling).
Choose an existing day or Unscheduled, optionally search for and select the exact
map location, then select **Add to trip**. Suggestions do not change the itinerary
until added. The map and itinerary refresh after insertion; **Open card** opens the
normal editor. Adding a suggestion is atomic and safe to retry. New chat clears
the conversation without deleting cards already added.

Trip context includes scheduled and unscheduled cards, city places, day/time-zone
details, accommodation candidates and confirmed options, notes, and todos.
Descriptions and notes are bounded; attachment contents and account details are
excluded. D1 caches this compact snapshot per trip. Database triggers invalidate
it when any source record is inserted, updated, moved, or deleted, including edits
by another owner. Revision checks prevent a concurrent edit from publishing a
stale snapshot. Every request still checks ownership; private chat histories are
never part of the shared snapshot. Ordinary messages and clearing chat do not
reload the map, photos, or parent trip data. No AI or place-search requests run
until the user asks or searches. The ten-message-per-minute limit is shared with
card chat.

Run `bun test tests/trip-chat.test.ts` for mocked provider, real SQLite migration,
cache invalidation, authorization, and atomic insertion checks. After building,
run `bunx playwright test tests/browser/trip-chat.e2e.ts` for isolated browser
checks, including location selection, refresh behavior, retries, and mobile sizing.

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

Every new trip is owned by its creator. An owner can open a trip's **Settings**
tab and add another registered account by email; all owners have equal access.
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

### Card search

The Itinerary and Map tabs include search across every card in the current trip,
including Unscheduled. Results open the existing card editor and refresh after
saves. Search covers titles, descriptions, selected Google place names (including
locations inside area cards), and transport origin/destination names and addresses.

Apply `0016_card_search.sql` before running this version. It adds saved place names
and a D1 FTS5 index, backfills existing card text, and installs triggers to keep
the index synchronized with card and area-location inserts, updates, and deletes.
Existing places without a saved name are searchable by their original search
text; reselect a place to save its exact Google name. Searches use literal word
prefixes, ignore case and accents, require every word, and return up to 50 ranked
matches scoped to the signed-in user's current trip. Searching does not call Google.
The FTS table, source view, and triggers are managed by the SQL migration rather
than Drizzle's schema export.

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
or arrival time, and interpret that time in the day or trip time zone, falling
back to the browser's time zone when neither is set.

For deployment, set the Worker secret with `bunx wrangler secret put GOOGLE_MAPS_API_KEY`.
The key is never sent to the browser. Search runs when the user clicks Search,
presses Enter, or pastes a Google Maps URL in the location field. Shared short
links are expanded through validated Google Maps hosts. Links with a place ID
use Place Details (New) and attach the exact place; other supported place links
use Text Search (New), with a coordinate bias when available, and let the user
choose a match. Search returns up to five results with names, addresses, IDs,
types, and attribution. For new location cards, choosing a place fills the title
and Food / Place of interest subcategory when those fields are empty. Descriptions
remain manual; editorial summaries are not requested. Click Add card to save.
Cards store the selected place ID, place name, and a readable name/address query;
transport endpoints additionally store the selected
short name and full address for their titles and routing.
City/area cards can store multiple selected places. Each place has a free-form
type, with Restaurants, Coffee, and Interest offered as suggestions. Their map
uses type-colored Advanced Markers and fetches coordinates from the saved Place
IDs in the browser rather than storing Google coordinates.
Location cards save the first available Places photo's media URL and source
attribution URL when their selected location is saved or changed (migration
`0019_card_google_photos.sql`). Page loads reuse those URLs without a Google photo
lookup. When no uploaded cover is selected, a failed image triggers one refresh
attempt and saves the replacement URL. Older cards without a saved photo resolve
one when their cover approaches the viewport. Uploaded covers suppress these
fallback lookups. Photo resource names are not stored. The card links directly
to the source photo on Google Maps for attribution. Links use Google's
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
Type `@` in a new task to suggest board members; choose a suggestion with the
arrow keys and Enter or click a name. A matching `@name` is removed from the saved
text and tags that person. Each task supports one tagged person. Click the plus
circle on an untagged task to assign someone, or the person's initial to replace
or remove their tag. Owner tags require migration `0008_todo_owners.sql`.

### Verification

Cards support up to five JPG/JPEG, PNG or PDF attachments, 10 MB each. Attachments are
uploaded or removed when the card is saved; Cancel discards pending changes.
Location cards can select one saved or newly selected JPG or PNG as their cover image;
PDF files cannot be covers. An uploaded cover takes priority over the Google
Places photo fallback.
PNG support requires migration `0010_png_card_attachments.sql`.
Hike cards require migration `0011_hike_cards.sql`, which converts existing Hike
locations while preserving their measurements and attachments. Hikes accept one
GPX file (up to 10 MB) in addition to the five regular attachments. The board uses
lazy-loaded static previews stored in R2 beside each GPX attachment. Saving a new
GPX generates a self-contained SVG with embedded OpenStreetMap tiles, the route,
start/finish markers, and attribution. Existing hikes generate their preview on
first display. Replacing or removing the GPX also removes its old preview; a tile
outage does not prevent saving the hike and a missing preview is retried on its
next display. No additional database migration or rendering service is needed.

Opening a hike card loads its interactive Leaflet map and elevation profile.
GPX files and previews use private browser caching for one day, vary by session
cookie, and support ETag revalidation. Replacement uploads have new URLs. Parsed
tracks are shared per user in memory for five minutes (up to eight tracks),
including concurrent downloads; failed downloads are not cached. Preview tile
downloads reuse an R2 cache, honor upstream expiry headers, and revalidate stale
tiles. Only tiles for the preview's single viewport are fetched.

Leaflet renders the route over OpenStreetMap tiles, with no Google Maps key required. To enable
the **Thunderforest Outdoors** alternative, set `THUNDERFOREST_API_KEY` in
`.dev.vars` and restart the dev server. For production, configure it with
`bunx wrangler secret put THUNDERFOREST_API_KEY`. Get a key from your
[Thunderforest dashboard](https://www.thunderforest.com/docs/apikeys/).
This key is sent to the browser for direct tile requests. The map's top-right
layer picker switches between OpenStreetMap (the default) and Outdoors without
resetting the route or map position. The layer picker is available inside the
card editor; board previews use OpenStreetMap. Without a key, hikes continue to use OpenStreetMap.
Length is
the sum of distances between consecutive points within each segment; elevation
gain sums uphill changes without joining separate segments. Missing elevation
data is shown as unavailable. Tracks take precedence over routes when both are
present. Uploading a replacement GPX recalculates both values; removing it clears
them. Recorded GPS/elevation noise can affect these measurements.
Hikes can also select a Google location and appear as green pins in the trip's
Map tab (location cards use blue pins). Elevation profiles appear only in the
card modal. Hover, touch, or use arrow keys on a profile to highlight the same
recorded sample on both the chart and route map. Samples without elevation do
not show a cursor.
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

- **Location**: title, optional subcategory (Place of interest or Food),
  description, Google Maps location, and attachments.
- **Hike**: title, description, GPX route map with length and elevation gain,
  and JPG, PNG or PDF attachments.
- **City / area / region**: a name plus multiple typed Google places displayed
  together on a color-coded map, independently movable like any other card.
- **Transport**: mode (including train and subway), start and end locations, with
  optional times, separate departure and arrival time zone overrides, service
  number, notes, and attachments. Blank overrides inherit the day/trip time zone,
  or the device time zone if neither is set. Changing a zone preserves entered
  clock times. Route previews and estimates use departure when both times are set.
  Transport time zone overrides require migration `0013_transport_timezones.sql`.

The **Map** tab shows location-card pins across every day and Unscheduled.
Click a pin or a card in the list to open the same editable card modal as the
itinerary. The map uses Leaflet and OpenStreetMap tiles with the existing Google
Maps browser key and Places API (New) to resolve saved Google place IDs.
Cards without a saved location or with failed lookups remain available in the
list. Lookups are deduplicated, limited to four at once, and cached in memory
while the map view is open. No migration is needed for the map tab.

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

For the map browser test, seed the isolated D1 SQLite file (the long `.sqlite`
filename under `$drag_test_state/v3/d1/miniflare-D1DatabaseObject/`, not
`metadata.sqlite`) with:

```bash
bun tests/browser/seed-map-user.ts /path/to/isolated/database.sqlite
```

The map test mocks Google coordinates and map tiles; it exercises the real
Leaflet renderer, card saves, and tab navigation without API calls. Configure a
non-empty `GOOGLE_MAPS_BROWSER_API_KEY` in the local test server; the mocked API
does not use its value.

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

## Trip URLs

Trip links use a stable eight-character lowercase code, for example
`/trips/k7mp4x9w`. UUIDs remain the internal database keys. Existing page links
redirect to the short URL, preserving the tab and query string; existing POST
URLs remain supported. Trip ownership is still required.

Apply migration `0021_trip_codes.sql` before running the updated app. It assigns
codes to existing trips and enforces uniqueness. New trips retry code collisions.
Run `bun test tests/trip-codes.test.ts` for migration, URL, ownership, and mutation
checks.

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
