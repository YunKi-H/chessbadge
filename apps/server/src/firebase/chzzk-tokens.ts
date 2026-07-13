import { FieldValue, Timestamp } from "firebase-admin/firestore";
import type { ChzzkTokenResponse } from "../auth/chzzk/client.js";
import { getChzzkTokenCipher } from "../security/token-cipher.js";
import { getFirestoreDb } from "./admin.js";

export async function saveChzzkStreamerTokens(
  uid: string,
  token: ChzzkTokenResponse
): Promise<void> {
  const cipher = getChzzkTokenCipher();
  const tokenRef = getFirestoreDb().collection("chzzkTokens").doc(uid);

  await tokenRef.set(
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
}

function encryptionContext(uid: string, tokenKind: "access" | "refresh") {
  return `chzzk:${uid}:${tokenKind}`;
}
