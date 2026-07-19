# Privacy Data Inventory

This document records the personal data currently processed by EloBadge. It is
an engineering inventory for retention-policy and privacy-policy work, not the
public privacy policy itself.

Status labels:

- `Stored`: persisted until an explicit deletion or infrastructure rotation.
- `Transient`: held in process memory or sent through a live connection only.
- `Derived`: generated from another identifier or configuration.

## 1. Account and identity data

| Data | Purpose | Location | Status | Current deletion behavior |
| --- | --- | --- | --- | --- |
| Firebase UID (`chzzk:{channelId}`) | Authenticate and join service records | Firebase Authentication, Firestore document IDs | Stored, derived | Deleted by the authenticated EloBadge account-deletion flow |
| Chzzk channel ID | Identify viewers and streamers; match chat senders | `users`, `chzzkAccounts`, `streamers`, Firebase custom claims | Stored | Deleted from Firebase Auth and Firestore on account deletion |
| Chzzk channel name/display name | Display account identity | Firebase Authentication, `users`, `chzzkAccounts`, `streamers` | Stored | Deleted from Firebase Auth and Firestore on account deletion |
| Login mode (`viewer` or `streamer`) | Route the OAuth login flow | In-memory OAuth/login exchange | Transient | OAuth state expires after 10 minutes; Firebase login exchange expires after 2 minutes |

Viewer Chzzk access and refresh tokens are used for identity lookup and are not
persisted. Firebase Authentication uses its browser SDK's persistence; the exact
browser storage entries are managed by Firebase rather than EloBadge code.

## 2. Streamer and OAuth data

| Data | Purpose | Location | Status | Current deletion behavior |
| --- | --- | --- | --- | --- |
| Chzzk access token | Create chat sessions and call Chzzk APIs | `chzzkTokens/{firebaseUid}` | Stored, AES-256-GCM encrypted | Deleted after successful connection revocation or unconditionally from local storage on account deletion |
| Chzzk refresh token | Refresh and revoke access | `chzzkTokens/{firebaseUid}` | Stored, AES-256-GCM encrypted | Deleted after successful connection revocation or unconditionally from local storage on account deletion |
| Token type, scope and expiry | Token lifecycle management | `chzzkTokens/{firebaseUid}` | Stored | Deleted with token document |
| Chat-session intent and token status | Restore streamer sessions after restart | `streamers/{firebaseUid}` | Stored | Session is disabled on disconnect; streamer document is deleted on account deletion |
| Token/session error timestamps | Diagnose reauthentication state | `streamers/{firebaseUid}` | Stored | Deleted on account deletion |

The token encryption key is held in the server environment and is not stored in
Firestore. Application credentials and Firebase Admin credentials are also
server secrets, not user data returned to browsers.

## 3. Chess.com account and rating data

| Data | Purpose | Location | Status | Current deletion behavior |
| --- | --- | --- | --- | --- |
| Chess.com username and normalized username | Find and identify the public chess profile | `chessAccounts/{accountId}` | Stored | Deleted immediately on disconnect |
| Chess.com player ID | Detect identity changes and verify ownership | `chessAccounts`, verification challenge | Stored | Deleted immediately on disconnect |
| Profile URL, avatar URL and account status | Display and validate the linked profile | `chessAccounts/{accountId}` | Stored | Deleted immediately on disconnect |
| Bullet, Blitz and Rapid ratings, deviation and update times | Select and display the highest rating | `chessAccounts/{accountId}/ratings/{speed}` | Stored | Deleted immediately on disconnect |
| Verification status, method and timestamps | Prove account ownership | `chessAccounts/{accountId}` | Stored | Deleted immediately on disconnect |
| Chess.com Location value | Compare the public profile against a challenge | Server memory during verification request | Transient | Not written to Firestore by EloBadge |
| Hashed verification code, failed attempts and expiry | Verify profile ownership | `chessVerificationChallenges/{accountId}` | Stored | Deleted after success or disconnect; expired challenges are deleted by a startup and six-hour server cleanup job |
| Rating refresh status, failures, lease IDs and timestamps | Schedule and coordinate refreshes | `chessAccounts/{accountId}` | Stored | Deleted on Chess.com disconnect or EloBadge account deletion |

Chess.com profile and rating data is publicly available at the source, but it
remains personal data when EloBadge associates it with a Chzzk identity.

## 4. Chat and overlay data

| Data | Purpose | Location | Status | Current deletion behavior |
| --- | --- | --- | --- | --- |
| Streamer's chat channel ID | Route chat and diagnose the affected streamer | Process memory, SSE event, application log | Transient plus logged | Application logs are retained for at most 14 days by the host journal policy |
| Sender channel ID | Find a rating badge and identify the SSE event source | Process memory and SSE event | Transient | Not written to Firestore or application logs per message |
| Nickname and message content | Render the overlay | Process memory and SSE event | Transient | Not written to Firestore or application logs |
| Chzzk role, badge image URLs and emoji image URLs | Render and classify chat | Process memory and SSE event | Transient | Not stored per message in Firestore |
| Selected chess badge | Avoid a Firestore lookup for each message | `chzzkAccounts/{channelId}.badge`, in-memory cache | Stored plus transient cache | Cleared on chess account disconnect |
| Overlay public token | Authorize an OBS browser source | `streamers`, `overlays`, browser-source URL | Stored secret-like identifier | Previous token is deleted on rotation; current disabled token is retained for reuse; orphaned legacy tokens are cleaned daily; all are deleted on account deletion |
| Overlay appearance settings | Render streamer-selected UI | `overlays/{publicToken}.theme` | Stored | Copied to the new token on rotation and deleted with the previous document; deleted on account deletion |
| Disclosure-section UI state | Remember expanded settings sections | Browser `localStorage` | Stored on user device | User clears browser storage |

The application keeps at most 30 chat messages in each open browser overlay.
Messages expire according to the streamer's display-duration setting, but this
does not control application-log retention.

Account deletion does not selectively rewrite operational logs. Any UID or
streamer channel ID already present in those logs remains until journald removes
it under the 14-day retention policy.

## 5. Operational and access logs

Fastify production logs currently include:

- HTTP method, sanitized URL, response status and response time.
- Streamer channel ID, author kind, message length, badge count, emoji count and
  message time for each received chat message.
- Firebase authentication errors and server error stack traces.
- A Firebase UID in some token, session, and disconnect error logs.
- OAuth token type, expiry, scope and login mode, but not raw OAuth tokens.

Overlay bearer-token path segments are redacted by the Fastify request
serializer. Raw socket payload diagnostics use debug level and are therefore
off in the production info-level logger. Optional Chzzk badge diagnostics are
disabled by default.

Docker sends application and Caddy stdout/stderr to the host's systemd journal.
The repository's host policy sets `MaxRetentionSec=14day`, rotates journal files
daily, caps persistent journal usage at 200 MB, and keeps at least 500 MB free.
Size and free-space limits can delete logs earlier than 14 days. The policy
applies to the entire dedicated Lightsail host and disables duplicate forwarding
to syslog. Caddy access logging is not enabled in the current Caddyfile.

## 6. External services and data flows

The legal classification of each provider as a processor, third-party
recipient, or source must be confirmed before publishing the privacy policy.

| Service | Data flow | Purpose | Location/transfer information |
| --- | --- | --- | --- |
| Naver Chzzk | OAuth code and tokens, channel identity, chat events | Login and live chat collection | App registration terms and processing location |
| Google Firebase Authentication | UID, display name, custom claims, auth metadata | User authentication | Firebase documents Firebase Authentication as processing data exclusively in US data centers |
| Google Cloud Firestore | All Firestore records listed above | Primary database | `asia-northeast3` (Seoul), verified from the Firestore database configuration |
| AWS Lightsail | Application memory and Docker application logs retained for at most 14 days | Hosting | `ap-northeast-2` (Seoul), verified from the origin IP's AWS range; snapshot settings still require console confirmation |
| Cloudflare | DNS and registrar data | Domain registration and authoritative DNS | DNS-only as of 2026-07-20; HTTP traffic connects directly to the Lightsail origin; enabled account analytics products still require console confirmation |
| Chess.com PubAPI | Username requests; profile, Location and rating responses | Chess account linking and refresh | API terms and processing location |
| Google Fonts | Viewer IP address, user agent and referrer may be sent by the browser | Web-font delivery | Provider terms and transfer details |
| jsDelivr/GitHub-hosted font assets | Viewer IP address, user agent and referrer may be sent by the browser | Web-font delivery | CDN provider and processing locations |
| Naver `hangeul.pstatic.net` | Viewer IP address, user agent and referrer may be sent by the browser | Web-font delivery | Provider terms and processing location |

GitHub Actions and GHCR build and distribute application code. No production
user database or runtime logs are intentionally sent there by the application.

EloBadge intentionally retains external web-font delivery for the available
font presets. This avoids bundling a large font library with every application
deployment, but means a viewer's browser can contact the font providers listed
above. Revisit this decision if provider terms change or stricter network
privacy becomes a product requirement.

Infrastructure facts were checked on 2026-07-20 using these signals:

- Firestore CLI reported the default database location as
  `asia-northeast3`.
- `elobadge.com` resolved directly to `52.79.91.148`; AWS's published IP ranges
  classify that address under `ap-northeast-2`.
- The public HTTP response contained a Caddy `Via` header and no Cloudflare
  proxy response headers. Cloudflare nameservers remain authoritative for the
  domain, so Cloudflare still processes DNS and registrar-related data.

These are deployment facts, not permanent assumptions. Recheck this section
after changing the Firestore database, Lightsail instance, DNS records, or the
Cloudflare proxy switch.

Reference material:

- [Firebase privacy and data-processing locations](https://firebase.google.com/support/privacy)
- [Cloud Firestore locations](https://firebase.google.com/docs/firestore/locations)
- [AWS published IP address ranges](https://ip-ranges.amazonaws.com/ip-ranges.json)

## 7. Current retention gaps

The following decisions and implementation work are required before the public
privacy policy can state accurate retention periods:

1. Confirm the Lightsail automatic-snapshot setting and which Cloudflare
   account analytics products, if any, are enabled.
2. Add an authenticated self-service data export; email support must not
   disclose raw account records without a secure verification path.
3. Define the service's policy for users under 14 years old.

The operating procedure for access, correction, deletion, and processing
restriction requests is defined in `docs/privacy-request-process.md`.

## 8. Facts needed from the operator

The public privacy policy cannot be finalized until these operator facts are
available:

- Operator name (individual or business name).
- Business address, if one must be disclosed.
- Privacy contact and responsible person; currently only
  `support@elobadge.com` is known.
- Effective date of the policy.
- Whether Lightsail automatic snapshots are enabled, including their retention
  behavior.
- Which Cloudflare analytics or logging products are enabled for the zone.
