# EloBadge

EloBadge is a Chzzk-first chess rating chat overlay for streamers.

## Stack

- Frontend: React, Vite, Tailwind CSS
- Backend: Fastify, TypeScript
- Database/Auth: Cloud Firestore, Firebase Authentication
- Firebase access: Firebase Admin SDK on the server, Firebase Web SDK for auth
- Realtime: SSE first, WebSocket later if needed
- Deploy target: Amazon Lightsail Linux instance with Docker Compose and Caddy

Local development uses Node.js 24 LTS, pnpm 11, and Java 21 or newer for the
Firestore Emulator. Production containers pin Node.js 24.18.0.

## Repository Layout

```text
apps/
  server/   Fastify API, Chzzk ingestion, SSE gateway, jobs
  web/      React/Vite dashboard and OBS overlay UI
packages/
  core/     Shared domain types and rating rules
docs/       Architecture and Firestore data model
```

The browser does not access Firestore directly. React authenticates with Firebase,
then calls the Fastify API. Fastify verifies the Firebase ID token and accesses
Firestore through the Admin SDK.

## Web Routes

The Vite application uses React Router and separates each user workflow into its
own route:

```text
/                       Streamer/viewer entry point
/streamer               Chzzk connection and OBS overlay management
/viewer                 Chzzk login and Chess.com/Lichess account management
/auth/chzzk/callback     Shared OAuth completion screen
/overlay/:publicToken    Minimal, transparent OBS browser source
```

The OBS route deliberately renders outside the dashboard shell so navigation and
page backgrounds never appear on the broadcast. Dashboard routes are loaded on
demand to keep the overlay bundle independent from account-management UI.

## Chzzk Login Flow

```text
GET /api/auth/chzzk/start?mode=streamer|viewer
  -> Chzzk OAuth
  -> GET /open/v1/users/me
  -> users and chzzkAccounts upsert
  -> streamer mode only: streamers upsert and chat session start
  -> Firebase Custom Token creation
  -> web callback with a short-lived one-time code
  -> POST /api/auth/firebase/exchange
  -> Firebase browser sign-in
```

Both modes create the same Firebase user and Chzzk account mapping. Viewer mode
does not create a streamer record or start a Chzzk chat session. A user can be
both a viewer and a streamer; logging in as a viewer does not remove an existing
streamer record.

Viewer OAuth credentials are used only to call Chzzk's current-user API during
the callback and are not persisted. Streamer access and refresh tokens are
encrypted with AES-256-GCM before being stored in Firestore. The active streamer
access token also lives in the in-memory chat session and is cleared when that
session stops. The server schedules a refresh five minutes before access-token
expiration, atomically writes both newly issued tokens, and updates the active
chat session. A rejected refresh token marks the streamer as requiring login.

The refresh scheduler and duplicate-refresh guard currently live in process
memory. Run one server task for the MVP; distributed coordination is required
before multiple ECS tasks can refresh the same one-time token safely.

Chzzk chat connections are managed independently in a map keyed by the
streamer's Firebase UID. Logging in or stopping one streamer does not replace
another streamer's socket, token refresh timer, status, or event subscription.
The test SSE route scopes live chat events to the UID supplied by the signed-in
browser. This test route is not an authorization boundary; production overlays
will use a separate unguessable public token.

Streamer login persists `chatSessionEnabled=true`, while a manual stop persists
`false`. After Fastify starts accepting requests, it restores enabled sessions
in the background with a concurrency limit of five. Failed restores retry with
exponential backoff; UID-scoped serialization prevents a concurrent manual stop
from being overwritten by recovery.

Each Chzzk socket has a control-plane watchdog. Connection and subscription
acknowledgements must arrive within ten seconds, then `/open/v1/sessions` is
checked every minute. Two consecutive responses that do not contain the active
session with a `CHAT` subscription trigger a fresh session URL with capped
exponential backoff. Session-list request failures are reported as `unknown` and
do not force reconnection. Chat inactivity is never treated as a failure.

To inspect undocumented Chzzk badge shapes temporarily, set
`CHZZK_BADGE_DIAGNOSTICS=true` and restart the server. The diagnostic logs only
role, verification state, badge field names, short type-like metadata, and a
sanitized image host/path/fingerprint. It omits chat content, nicknames, channel
IDs, full image URLs, query strings, and fragments, and logs each unique shape
once per process. Disable the flag and restart after collecting samples.

Authenticated streamers can create, rotate, enable, and disable a 256-bit public
overlay token. `/overlay/{token}` is the OBS browser-source page and
`/events/overlay/{token}` streams only that token's streamer events. Rotation or
disablement revokes current in-process SSE connections immediately; periodic
Firestore revalidation also closes connections changed by external processes.
Rotation deletes the previous overlay document after copying its appearance.
Disabling preserves the current document so enabling can restore the same OBS
URL. A daily cleanup removes legacy inactive documents that are no longer the
streamer's current token.

The Custom Token is never placed in the callback URL. The one-time login code is
kept in server memory for two minutes and can be consumed only once. This is valid
for the single-task MVP. Move the exchange store to Redis before running multiple
ECS tasks.

Use `GET /api/firebase/status` to verify both Firebase Authentication and Firestore
server connectivity. This diagnostic endpoint requires Firebase authentication.

Production HTTP requests receive standard security headers and are rate-limited
per client IP. `WEB_APP_URL` is the default allowed browser origin; add any
additional origins through the comma-separated `CORS_ALLOWED_ORIGINS` variable.

## Authenticated API

After Firebase browser sign-in, React sends the current Firebase ID Token to
Fastify on every protected request:

```http
Authorization: Bearer <firebase-id-token>
```

Fastify verifies the token with the Firebase Admin SDK and exposes the verified
`uid`, `provider`, and `chzzkChannelId` to route handlers. The current protected
endpoints are:

```text
GET  /api/me
DELETE /api/account
GET  /api/chzzk/session/status
POST /api/chzzk/session/stop
GET  /api/overlay
POST /api/overlay
POST /api/overlay/rotate
POST /api/overlay/disable
PATCH /api/overlay/appearance
GET  /api/chess/chesscom/account
POST /api/chess/chesscom/account
DELETE /api/chess/chesscom/account
POST /api/chess/chesscom/verification
POST /api/chess/chesscom/verification/confirm
```

The Chzzk session manager also records the owning Firebase UID, so an authenticated
user cannot inspect or stop another user's active session.

Before changing Chzzk application permissions, an operator can inspect and revoke
all persisted streamer tokens with the one-off CLI. It is a dry run by default;
execution requires the current Firebase project ID as an explicit confirmation.

```bash
pnpm chzzk:revoke-all
pnpm chzzk:revoke-all --execute --confirm-project=<FIREBASE_PROJECT_ID>
```

The command calls Chzzk token revocation sequentially and deletes a local token
only after remote revocation succeeds. Failed documents remain available for a
later retry. Streamers authorize again through the normal streamer login flow;
the dashboard does not show a separate migration status.

## Chess.com Rating Link

The viewer page at `/viewer` can register a Chess.com username. Fastify reads
the public profile and Bullet, Blitz, and Rapid stats through the Chess.com
PubAPI, then stores the account and rating snapshots in Firestore. PubAPI calls
are serialized in process to avoid parallel-request rate limits and use the
identifying `CHESS_COM_USER_AGENT` value from `.env`.

This is intentionally not treated as account ownership verification. Newly
registered Chess.com accounts have `verifiedAt: null`, and their ratings cannot
be copied into the Chzzk badge or shown on an overlay.

For the MVP, viewers can generate a 48-hour one-time code and temporarily place
it in their Chess.com profile Location. Fastify checks the public profile's
stable player ID and Location, then records
`verificationMethod="profile_location"`. Only the code hash is stored, a new
challenge invalidates the previous code, and ten failed checks exhaust a
challenge. Chess.com PubAPI caching means a correct profile edit may not be
visible immediately. Approved Chess.com OAuth remains the preferred long-term
replacement for this flow.

After verification, the server automatically chooses the numerically highest
available Bullet, Blitz, or Rapid rating and writes a denormalized badge to the
viewer’s Chzzk account. Ties prefer Rapid, then Blitz, then Bullet. Refreshing
Chess.com data recalculates the highest rating. Incoming chat resolves the
badge by `senderChannelId` through a 60-second in-memory cache and includes it in
the existing SSE overlay event. A badge lookup failure degrades to a normal chat
message without dropping chat delivery.

Disconnecting a Chess.com account clears the user pointer, ownership
verification, pending challenge, selected speed, rating snapshots, account
document, and denormalized Chzzk badge. Reconnecting requires a fresh ownership
verification.

Verified Chess.com ratings refresh automatically every 12 hours with up to 30
minutes of jitter. A background scan runs every 15 minutes, processes PubAPI
requests serially, and retries failures with capped exponential backoff without
removing the last valid badge. Firestore leases prevent duplicate refreshes.
Viewers can also request a refresh from the account page once every five minutes;
the cooldown is persisted in Firestore.

## Lichess Rating Link

The viewer page starts a Lichess OAuth authorization-code flow with PKCE and no
requested scopes. The server keeps the one-time state and PKCE verifier in
memory for ten minutes. At the callback it exchanges the code, reads
`/api/account` to prove ownership, stores the public Bullet, Blitz, Rapid, and
Classical ratings, and immediately revokes the temporary access token. Lichess
tokens are never persisted in Firestore.

The highest available standard rating becomes the active chat badge. Lichess
provisional ratings preserve their provisional marker. A public profile request
supports manual refresh with a persisted five-minute cooldown. Disconnecting
deletes the account and all four rating documents. When both providers are
connected, `chzzkAccounts.badges` stores both ratings and
`preferredChessProvider` is the only viewer preference. Refreshing an account
updates that provider's badge without changing the viewer's selection.

Overlay documents created before the current appearance schema require a
one-time backfill. The command runs as a dry run unless execution and the
Firebase project ID are supplied:

```bash
docker compose exec app node apps/server/dist/scripts/migrate-overlay-appearances.js
docker compose exec app node apps/server/dist/scripts/migrate-overlay-appearances.js \
  --execute --confirm-project=<FIREBASE_PROJECT_ID>
```

After a final dry run returns zero overlays, the temporary appearance fallback
and migration command can be removed.

## First Milestone

The first product risk to remove is Chzzk chat ingestion:

1. Complete Chzzk OAuth.
2. Create a Chzzk chat session.
3. Subscribe to chat events.
4. Print `senderChannelId`, `nickname`, `content`, and `messageTime`.
5. Forward those events to `/events/test` via SSE.

## Firebase Setup

1. Create a Firebase project.
2. Enable Firebase Authentication and Cloud Firestore.
3. Create a service account for the Fastify server.
4. Copy `.env.example` to `.env` and fill in the Firebase values.
5. Deploy `firestore.rules` and `firestore.indexes.json` before allowing
   production traffic.

The existing Chzzk chat proof of concept still runs without Firebase credentials.
Firebase is initialized lazily when an auth or database feature first uses it.

## Production Deployment

The production image is built by GitHub Actions and published to GHCR. A
Lightsail instance only pulls and runs the image; it does not compile the
TypeScript workspace. Caddy terminates HTTPS and proxies both normal HTTP and
long-lived SSE requests to Fastify.

See [docs/lightsail-deployment.md](docs/lightsail-deployment.md) for the complete
first deployment, update, rollback, and OAuth configuration procedure.

## Firestore Emulator Tests

Java 21 or newer is required. The integration suite starts an isolated Firestore
Emulator with the non-production project ID `demo-elobadge-emulator`, loads
`firestore.rules`, runs the tests, and stops the emulator automatically:

```sh
pnpm test:emulator
```

The suite covers Chess.com linking, verification failures, highest-rating badge
selection, disconnect cleanup, duplicate-account protection, and denial of
direct unauthenticated Firestore access. It does not use values from `.env` or
connect to the production Firestore project.
