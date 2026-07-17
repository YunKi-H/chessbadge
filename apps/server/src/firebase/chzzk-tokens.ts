import { FieldValue, Timestamp } from "firebase-admin/firestore";
import type { ChzzkTokenResponse } from "../auth/chzzk/client.js";
import { getChzzkTokenCipher } from "../security/token-cipher.js";
import { getFirestoreDb } from "./admin.js";

export interface StoredChzzkTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresAt: Date;
  scope: string | null;
}

export class ChzzkStoredTokenDecryptionError extends Error {
  constructor(readonly uid: string, options?: ErrorOptions) {
    super(`Stored Chzzk token could not be decrypted for ${uid}`, options);
    this.name = "ChzzkStoredTokenDecryptionError";
  }
}

export async function saveChzzkStreamerTokens(
  uid: string,
  token: ChzzkTokenResponse
): Promise<void> {
  const cipher = getChzzkTokenCipher();
  const db = getFirestoreDb();
  const tokenRef = db.collection("chzzkTokens").doc(uid);
  const streamerRef = db.collection("streamers").doc(uid);
  const batch = db.batch();

  batch.set(
    tokenRef,
    {
      encryptedAccessToken: cipher.encrypt(
        token.accessToken,
        encryptionContext(uid, "access")
      ),
      encryptedRefreshToken: cipher.encrypt(
        token.refreshToken,
        encryptionContext(uid, "refresh")
      ),
      tokenType: token.tokenType,
      expiresAt: Timestamp.fromMillis(Date.now() + token.expiresIn * 1_000),
      scope: token.scope,
      encryptionVersion: 1,
      updatedAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  batch.set(
    streamerRef,
    {
      tokenStatus: "active",
      tokenErrorAt: null,
      disconnectedAt: null,
      updatedAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  await batch.commit();
}

export async function loadChzzkStreamerTokens(
  uid: string
): Promise<StoredChzzkTokens | null> {
  const snapshot = await getFirestoreDb().collection("chzzkTokens").doc(uid).get();

  if (!snapshot.exists) {
    return null;
  }

  const data = snapshot.data();

  if (
    !data ||
    typeof data.encryptedAccessToken !== "string" ||
    typeof data.encryptedRefreshToken !== "string" ||
    typeof data.tokenType !== "string" ||
    !(data.expiresAt instanceof Timestamp) ||
    (data.scope !== null && typeof data.scope !== "string")
  ) {
    throw new Error(`Invalid stored Chzzk token document for ${uid}`);
  }

  const cipher = getChzzkTokenCipher();

  try {
    return {
      accessToken: cipher.decrypt(
        data.encryptedAccessToken,
        encryptionContext(uid, "access")
      ),
      refreshToken: cipher.decrypt(
        data.encryptedRefreshToken,
        encryptionContext(uid, "refresh")
      ),
      tokenType: data.tokenType,
      expiresAt: data.expiresAt.toDate(),
      scope: data.scope
    };
  } catch (error) {
    throw new ChzzkStoredTokenDecryptionError(uid, { cause: error });
  }
}

export async function listChzzkStreamerTokenUids(): Promise<string[]> {
  const snapshot = await getFirestoreDb().collection("chzzkTokens").get();
  return snapshot.docs.map((document) => document.id);
}

export async function deleteChzzkStreamerTokens(uid: string): Promise<void> {
  const db = getFirestoreDb();
  const batch = db.batch();

  batch.delete(db.collection("chzzkTokens").doc(uid));
  batch.set(
    db.collection("streamers").doc(uid),
    {
      chatSessionEnabled: false,
      tokenStatus: "reauth_required",
      tokenErrorAt: null,
      disconnectedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  await batch.commit();
}

export async function markChzzkStreamerReauthenticationRequired(
  uid: string
): Promise<void> {
  await getFirestoreDb().collection("streamers").doc(uid).set(
    {
      tokenStatus: "reauth_required",
      tokenErrorAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  );
}

function encryptionContext(uid: string, tokenKind: "access" | "refresh") {
  return `chzzk:${uid}:${tokenKind}`;
}
