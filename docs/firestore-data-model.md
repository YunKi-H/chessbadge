# Firestore Data Model

ChessBadge uses top-level collections with deterministic document IDs for the
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

Maps a chat sender directly to a ChessBadge user. `badge` is intentionally
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
  theme: Record<string, unknown>;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

The random document ID is the OBS browser-source token. It must be long enough
to resist guessing and must be replaceable from the streamer dashboard. Rotated
tokens remain as inactive documents so existing browser sources stop resolving.
The active token is also stored on `streamers/{firebaseUid}.overlayToken` for a
direct authenticated dashboard lookup.

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

Disconnecting clears the user pointer, verification fields, selected speed,
pending challenge, and Chzzk badge in one transaction. The detached account and
rating documents may remain for future refreshes, but `uid` and `verifiedAt`
must both be null so ownership cannot transfer implicitly.

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
