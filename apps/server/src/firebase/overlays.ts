import { randomBytes } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { getFirestoreDb } from "./admin.js";

export interface StreamerOverlayAccess {
  publicToken: string;
  active: boolean;
}

export class StreamerOverlayAccessError extends Error {
  constructor() {
    super("Only a registered streamer can manage an overlay");
    this.name = "StreamerOverlayAccessError";
  }
}

export function generateOverlayPublicToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function getStreamerOverlayAccess(
  streamerUid: string
): Promise<StreamerOverlayAccess | null> {
  const db = getFirestoreDb();
  const streamer = await db.collection("streamers").doc(streamerUid).get();
  const publicToken = streamer.data()?.overlayToken;

  if (typeof publicToken !== "string") {
    return null;
  }

  const overlay = await db.collection("overlays").doc(publicToken).get();
  const data = overlay.data();

  if (!data || data.streamerUid !== streamerUid || typeof data.active !== "boolean") {
    return null;
  }

  return { publicToken, active: data.active };
}

export async function enableStreamerOverlayAccess(
  streamerUid: string
): Promise<StreamerOverlayAccess> {
  return createOrRotateOverlayAccess(streamerUid, false);
}

export async function rotateStreamerOverlayAccess(
  streamerUid: string
): Promise<StreamerOverlayAccess> {
  return createOrRotateOverlayAccess(streamerUid, true);
}

export async function disableStreamerOverlayAccess(
  streamerUid: string
): Promise<string | null> {
  const db = getFirestoreDb();
  const streamerRef = db.collection("streamers").doc(streamerUid);

  return db.runTransaction(async (transaction) => {
    const streamer = await transaction.get(streamerRef);

    if (!streamer.exists) {
      throw new StreamerOverlayAccessError();
    }

    const publicToken = streamer.data()?.overlayToken;

    if (typeof publicToken !== "string") {
      return null;
    }

    const overlayRef = db.collection("overlays").doc(publicToken);
    const overlay = await transaction.get(overlayRef);

    if (overlay.exists && overlay.data()?.streamerUid === streamerUid) {
      transaction.set(
        overlayRef,
        { active: false, updatedAt: FieldValue.serverTimestamp() },
        { merge: true }
      );
    }

    return publicToken;
  });
}

export async function resolveActiveOverlayStreamer(
  publicToken: string
): Promise<string | null> {
  const overlay = await getFirestoreDb().collection("overlays").doc(publicToken).get();
  const data = overlay.data();

  if (!data || data.active !== true || typeof data.streamerUid !== "string") {
    return null;
  }

  return data.streamerUid;
}

async function createOrRotateOverlayAccess(
  streamerUid: string,
  rotate: boolean
): Promise<StreamerOverlayAccess> {
  const db = getFirestoreDb();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const candidateToken = generateOverlayPublicToken();
    const candidateRef = db.collection("overlays").doc(candidateToken);

    const result = await db.runTransaction(async (transaction) => {
      const streamerRef = db.collection("streamers").doc(streamerUid);
      const [streamer, candidate] = await Promise.all([
        transaction.get(streamerRef),
        transaction.get(candidateRef)
      ]);

      if (!streamer.exists) {
        throw new StreamerOverlayAccessError();
      }

      if (candidate.exists) {
        return null;
      }

      const existingToken = streamer.data()?.overlayToken;

      if (!rotate && typeof existingToken === "string") {
        const existingRef = db.collection("overlays").doc(existingToken);
        const existing = await transaction.get(existingRef);

        if (existing.exists && existing.data()?.streamerUid === streamerUid) {
          transaction.set(
            existingRef,
            { active: true, updatedAt: FieldValue.serverTimestamp() },
            { merge: true }
          );
          return existingToken;
        }
      }

      if (typeof existingToken === "string") {
        const existingRef = db.collection("overlays").doc(existingToken);
        const existing = await transaction.get(existingRef);

        if (existing.exists && existing.data()?.streamerUid === streamerUid) {
          transaction.set(
            existingRef,
            { active: false, updatedAt: FieldValue.serverTimestamp() },
            { merge: true }
          );
        }
      }

      const now = FieldValue.serverTimestamp();
      transaction.create(candidateRef, {
        streamerUid,
        active: true,
        theme: {},
        createdAt: now,
        updatedAt: now
      });
      transaction.set(
        streamerRef,
        { overlayToken: candidateToken, updatedAt: now },
        { merge: true }
      );

      return candidateToken;
    });

    if (result) {
      return { publicToken: result, active: true };
    }
  }

  throw new Error("Could not allocate a unique overlay token");
}
