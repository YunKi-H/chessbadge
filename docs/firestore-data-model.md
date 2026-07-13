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
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### `chzzkTokens/{firebaseUid}`

Server-only OAuth credentials for a streamer.

```ts
{
  encryptedAccessToken: string;
  encryptedRefreshToken: string;
  expiresAt: Timestamp;
  scopes: string[];
  updatedAt: Timestamp;
}
```

Never return this document to the browser. Token encryption keys belong in the
server environment or a secret manager, not in Firestore.

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
to resist guessing and must be replaceable from the streamer dashboard.

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
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

Ratings live under `chessAccounts/{accountId}/ratings/{speed}`. Updating the
user's selected rating must also update `chzzkAccounts/{chzzkChannelId}.badge`
in the same transaction or batch.

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
