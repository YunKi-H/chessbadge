# Firestore Data Model

EloBadge uses top-level collections with deterministic document IDs for the
lookups that happen on every chat message. Firestore access belongs to Fastify;
the browser does not read or write these collections directly.

## Collections

```text
users/{firebaseUid}
chzzkAccounts/{chzzkChannelId}
streamers/{firebaseUid}
chzzkTokens/{firebaseUid}
overlays/{publicToken}
chessAccounts/{accountId}
chessAccounts/{accountId}/ratings/{speed}
chessVerificationChallenges/{accountId}
```

### `users/{firebaseUid}`

The service user created after a successful Chzzk custom-auth login.

```ts
{
  displayName: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### `chzzkAccounts/{chzzkChannelId}`

Maps a chat sender directly to a EloBadge user. `badge` is intentionally
denormalized so the chat path needs only one document lookup before caching it.

```ts
{
  uid: string;
  displayName: string;
  badge: {
    provider: "lichess" | "chesscom";
    speed: "bullet" | "blitz" | "rapid" | "classical";
    value: number;
    provisional: boolean;
  } | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

Use the Chzzk channel ID as the document ID. This prevents two documents from
claiming the same Chzzk identity when writes are performed in a transaction.

### `streamers/{firebaseUid}`

Created only when the user completes Chzzk OAuth with `mode=streamer`. Viewer
login updates the common user and Chzzk account documents without creating this
document. Existing streamer documents remain when the same user logs in as a
viewer.

```ts
{
  chzzkChannelId: string;
  displayName: string;
  chatSessionEnabled: boolean;
  tokenStatus: "active" | "reauth_required";
  tokenErrorAt: Timestamp | null;
  disconnectedAt?: Timestamp;
  sessionUpdatedAt: Timestamp;
  overlayToken: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

`chatSessionEnabled` records the streamer's desired state, not the current
WebSocket state. A manual stop sets it to `false`; server shutdown does not. On
startup, the server restores documents where it is `true` and the token status
is `active`.

Disconnecting Chzzk first stops the live session and revokes the refresh token
through Chzzk. Only a successful remote revoke deletes
`chzzkTokens/{firebaseUid}` and sets `chatSessionEnabled` to false,
`tokenStatus` to `reauth_required`, and `disconnectedAt`. A revoke or token
decryption failure preserves the encrypted token document so the operation can
be retried with the matching app credentials and encryption key.

### `chzzkTokens/{firebaseUid}`

Server-only OAuth credentials for a streamer.

Viewer OAuth credentials are never stored in this collection. Streamer tokens
are encrypted with AES-256-GCM and authenticated against their Firebase UID and
token kind before being written. `scope` preserves the provider response as-is.

```ts
{
  encryptedAccessToken: string;
  encryptedRefreshToken: string;
  tokenType: string;
  expiresAt: Timestamp;
  scope: string | null;
  encryptionVersion: 1;
  updatedAt: Timestamp;
}
```

Never return this document to the browser. Token encryption keys belong in the
server environment or a secret manager, not in Firestore.

Access tokens are refreshed five minutes before expiration. Chzzk refresh tokens
are one-time credentials, so a successful refresh always replaces both encrypted
token fields. The current in-process refresh lock assumes one ECS server task.

### `overlays/{publicToken}`

```ts
{
  streamerUid: string;
  active: boolean;
  theme: {
    backgroundVisible: boolean;
    backgroundColor: string; // #RRGGBB
    backgroundOpacity: number; // integer from 0 through 100
    chzzkBadgesVisible: boolean;
    chzzkBadgeVisibility: {
      role: boolean;
      subscription: boolean;
      donation: boolean;
      subscription_gift: boolean;
      unknown: boolean;
    };
    nicknameVisible: boolean;
    nicknameColorMode: "fixed" | "by_user" | "by_role";
    nicknameColor: string; // #RRGGBB, used by fixed mode
    nicknameRoleColors: {
      streamer: string;
      manager: string;
      donator: string;
      subscriber: string;
      viewer: string;
    }; // #RRGGBB values used by role mode
    messageColorMode: "fixed" | "by_role";
    messageColor: string; // #RRGGBB, used by fixed mode
    messageRoleColors: {
      streamer: string;
      manager: string;
      donator: string;
      subscriber: string;
      viewer: string;
    }; // #RRGGBB values used by role mode
    fontFamily:
      | "system"
      | "pretendard"
      | "freesentation"
      | "paperlogy"
      | "noto_sans_kr"
      | "aggro"
      | "nanum_square"
      | "nanum_square_neo"
      | "nanum_square_round"
      | "jalnan"
      | "maru_buri"
      | "nanum_gothic"
      | "nanum_myeongjo"
      | "chosun_gungseo"
      | "mona12"
      | "dohyeon";
    fontSizePx: number; // integer from 12 through 36
    fontWeight: 400 | 500 | 600 | 700 | 900;
    fontLineHeight: 1.2 | 1.4 | 1.6;
    messageDurationSeconds: 0 | 10 | 20 | 30 | 60; // 0 keeps messages visible
  };
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

Legacy theme documents without font settings use the system font at 18px,
weight 400, and line height 1.4. Documents without `messageDurationSeconds` use
20 seconds, documents without `chzzkBadgesVisible` show Chzzk badges, and
documents without `nicknameRoleColors` or `messageRoleColors` use their default
role palettes. Documents without `messageColorMode` keep using the single
message color. The browser keeps at most the latest 30 messages regardless of
the duration.

The random document ID is the OBS browser-source token. It must be long enough
to resist guessing and must be replaceable from the streamer dashboard. Rotated
tokens remain as inactive documents so existing browser sources stop resolving.
The active token is also stored on `streamers/{firebaseUid}.overlayToken` for a
direct authenticated dashboard lookup.

Legacy documents with an empty `theme` use the default appearance. Rotating an
overlay token copies the current theme to the new document. Saving appearance
settings publishes an SSE `appearance` event so an open OBS browser source can
update without changing its URL or reloading the page.

Public overlay and SSE paths contain this bearer token. Application and
infrastructure access logs must redact the token path segment.

### `chessAccounts/{accountId}`

`accountId` is generated from the provider and normalized provider username.

```ts
{
  uid: string;
  provider: "lichess" | "chesscom";
  username: string;
  normalizedUsername: string;
  providerUserId: string | null;
  verifiedAt: Timestamp | null;
  verificationMethod: string | null;
  selectedSpeed: "bullet" | "blitz" | "rapid" | null;
  profileUrl: string;
  avatarUrl: string | null;
  accountStatus: string;
  ratingsFetchedAt: Timestamp;
  nextRatingRefreshAt: Timestamp;
  manualRefreshAvailableAt: Timestamp;
  lastRatingRefreshAttemptAt: Timestamp;
  ratingRefreshStatus: "idle" | "refreshing" | "failed";
  ratingRefreshFailureCount: number;
  lastRatingRefreshError?: string;
  ratingRefreshLeaseId?: string;
  ratingRefreshLeaseUntil?: Timestamp;
  disconnectedAt: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

Ratings live under `chessAccounts/{accountId}/ratings/{speed}`. Updating the
user's selected rating must also update `chzzkAccounts/{chzzkChannelId}.badge`
in the same transaction or batch.

Only a verified account can set `selectedSpeed`. Verification automatically
chooses the numerically highest Bullet, Blitz, or Rapid rating and copies it to
the denormalized Chzzk badge. Ties prefer Rapid, then Blitz, then Bullet.
Refreshing the same Chess.com account recalculates and refreshes the badge;
changing accounts or losing all supported ratings clears it.

Verified Chess.com accounts refresh automatically after 12 hours with up to 30
minutes of random jitter. Fastify scans for due accounts every 15 minutes and
processes PubAPI calls serially. Failed attempts retry with exponential backoff
from 5 minutes to 6 hours while preserving the last valid rating and badge. A
2-minute Firestore lease prevents duplicate work across concurrent server tasks
and expires automatically after an interrupted refresh. Manual refreshes use a
persisted 5-minute cooldown shared across browsers and server restarts.

Disconnecting clears the user pointer and Chzzk badge, then deletes the pending
challenge, Chess.com account, and all supported rating documents in one
transaction. Reconnecting fetches the public profile again and requires a new
ownership verification.

For Chess.com, the first registration uses the read-only PubAPI and therefore
always writes `verifiedAt: null`. A public username and public rating are not
proof of account ownership. Unverified accounts must never populate the
denormalized Chzzk badge. The initial supported Chess.com rating documents are
`bullet`, `blitz`, and `rapid`; Chess.com Daily is not mapped to classical.

The owning user stores a direct pointer at
`users/{firebaseUid}.chessAccountIds.chesscom`. This avoids a collection query
when loading the viewer settings page. A rating document contains:

```ts
{
  speed: "bullet" | "blitz" | "rapid";
  value: number;
  ratingDeviation: number;
  providerUpdatedAt: Timestamp;
  fetchedAt: Timestamp;
}
```

### `chessVerificationChallenges/{accountId}`

Chess.com ownership verification asks the viewer to temporarily place a
one-time code in the public profile Location field. The challenge document is
server-only and stores only the SHA-256 hash of that code.

```ts
{
  uid: string;
  accountId: string;
  provider: "chesscom";
  providerUserId: string;
  codeHash: string;
  failedAttempts: number;
  expiresAt: Timestamp;
  createdAt: Timestamp;
  lastAttemptAt?: Timestamp;
}
```

Creating a new challenge replaces the previous one. Challenges expire after 48
hours and allow at most ten failed checks. Confirmation must match the current
user, account document, stable Chess.com player ID, and an exact trimmed
Location value before setting `verificationMethod: "profile_location"`.
Successful verification deletes the challenge document. PubAPI caching can
delay visibility of a newly edited Location, so a mismatch is retryable and
does not consume or replace the challenge immediately.

The application rejects expired challenges immediately. Because the Firebase
project remains on the Spark plan, the Fastify process also queries and deletes
up to 100 expired challenge documents shortly after startup and every six
hours. A single-process lock prevents overlapping cleanup scans. This avoids
the billing requirement of Firestore's managed TTL feature while keeping
abandoned challenges bounded.

## Chat Lookup

```text
Chzzk CHAT event
  -> chzzkAccounts/{senderChannelId}
  -> badge
  -> in-memory or Redis cache
  -> SSE overlay event
```

Do not store every Chzzk chat message in Firestore. Chat is transient overlay
traffic; Firestore stores identities, configuration, verification, and ratings.
The server caches `senderChannelId -> badge` lookups for 60 seconds, coalesces
concurrent misses for the same sender, and invalidates the local entry after a
badge selection or account refresh. Firestore failures must not drop chat; the
message is published without a rating badge instead.
