# ChessBadge

ChessBadge is a Chzzk-first chess rating chat overlay for streamers.

## Stack

- Frontend: React, Vite, Tailwind CSS
- Backend: Fastify, TypeScript
- Database/Auth: Cloud Firestore, Firebase Authentication
- Firebase access: Firebase Admin SDK on the server, Firebase Web SDK for auth
- Realtime: SSE first, WebSocket later if needed
- Deploy target: ECS Fargate

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

Authenticated streamers can create, rotate, enable, and disable a 256-bit public
overlay token. `/overlay/{token}` is the OBS browser-source page and
`/events/overlay/{token}` streams only that token's streamer events. Rotation or
disablement revokes current in-process SSE connections immediately; periodic
Firestore revalidation also closes connections changed by external processes.

The Custom Token is never placed in the callback URL. The one-time login code is
kept in server memory for two minutes and can be consumed only once. This is valid
for the single-task MVP. Move the exchange store to Redis before running multiple
ECS tasks.

Use `GET /api/firebase/status` to verify both Firebase Authentication and Firestore
server connectivity.

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
GET  /api/chzzk/session/status
POST /api/chzzk/session/stop
```

The Chzzk session manager also records the owning Firebase UID, so an authenticated
user cannot inspect or stop another user's active session.

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
5. Deploy `firestore.rules` before allowing production traffic.

The existing Chzzk chat proof of concept still runs without Firebase credentials.
Firebase is initialized lazily when an auth or database feature first uses it.
