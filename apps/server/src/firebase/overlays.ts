import { randomBytes } from "node:crypto";
import {
  DEFAULT_OVERLAY_APPEARANCE,
  type OverlayAppearance
} from "@elobadge/core";
import { FieldValue } from "firebase-admin/firestore";
import { getFirestoreDb } from "./admin.js";

export interface StreamerOverlayAccess {
  publicToken: string;
  active: boolean;
  appearance: OverlayAppearance;
}

export interface ActiveOverlayAccess {
  streamerUid: string;
  appearance: OverlayAppearance;
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

  return {
    publicToken,
    active: data.active,
    appearance: normalizeOverlayAppearance(data.theme)
  };
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

export async function updateStreamerOverlayAppearance(
  streamerUid: string,
  appearance: OverlayAppearance
): Promise<StreamerOverlayAccess> {
  const db = getFirestoreDb();
  const streamerRef = db.collection("streamers").doc(streamerUid);

  return db.runTransaction(async (transaction) => {
    const streamer = await transaction.get(streamerRef);
    const publicToken = streamer.data()?.overlayToken;

    if (!streamer.exists || typeof publicToken !== "string") {
      throw new StreamerOverlayAccessError();
    }

    const overlayRef = db.collection("overlays").doc(publicToken);
    const overlay = await transaction.get(overlayRef);
    const data = overlay.data();

    if (!data || data.streamerUid !== streamerUid || typeof data.active !== "boolean") {
      throw new StreamerOverlayAccessError();
    }

    transaction.set(
      overlayRef,
      { theme: appearance, updatedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );

    return { publicToken, active: data.active, appearance };
  });
}

export async function resolveActiveOverlayAccess(
  publicToken: string
): Promise<ActiveOverlayAccess | null> {
  const overlay = await getFirestoreDb().collection("overlays").doc(publicToken).get();
  const data = overlay.data();

  if (!data || data.active !== true || typeof data.streamerUid !== "string") {
    return null;
  }

  return {
    streamerUid: data.streamerUid,
    appearance: normalizeOverlayAppearance(data.theme)
  };
}

export function normalizeOverlayAppearance(value: unknown): OverlayAppearance {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_OVERLAY_APPEARANCE };
  }

  const appearance = value as Partial<OverlayAppearance>;

  return {
    backgroundVisible:
      typeof appearance.backgroundVisible === "boolean"
        ? appearance.backgroundVisible
        : DEFAULT_OVERLAY_APPEARANCE.backgroundVisible,
    backgroundColor:
      typeof appearance.backgroundColor === "string" &&
      /^#[0-9A-Fa-f]{6}$/.test(appearance.backgroundColor)
        ? appearance.backgroundColor.toUpperCase()
        : DEFAULT_OVERLAY_APPEARANCE.backgroundColor,
    backgroundOpacity:
      typeof appearance.backgroundOpacity === "number" &&
      Number.isInteger(appearance.backgroundOpacity) &&
      appearance.backgroundOpacity >= 0 &&
      appearance.backgroundOpacity <= 100
        ? appearance.backgroundOpacity
        : DEFAULT_OVERLAY_APPEARANCE.backgroundOpacity,
    chzzkBadgesVisible:
      typeof appearance.chzzkBadgesVisible === "boolean"
        ? appearance.chzzkBadgesVisible
        : DEFAULT_OVERLAY_APPEARANCE.chzzkBadgesVisible,
    chzzkBadgeVisibility: normalizeChzzkBadgeVisibility(
      appearance.chzzkBadgeVisibility
    ),
    nicknameVisible:
      typeof appearance.nicknameVisible === "boolean"
        ? appearance.nicknameVisible
        : DEFAULT_OVERLAY_APPEARANCE.nicknameVisible,
    nicknameColorMode:
      appearance.nicknameColorMode === "fixed" ||
      appearance.nicknameColorMode === "by_user" ||
      appearance.nicknameColorMode === "by_role"
        ? appearance.nicknameColorMode
        : DEFAULT_OVERLAY_APPEARANCE.nicknameColorMode,
    nicknameColor:
      typeof appearance.nicknameColor === "string" &&
      /^#[0-9A-Fa-f]{6}$/.test(appearance.nicknameColor)
        ? appearance.nicknameColor.toUpperCase()
        : DEFAULT_OVERLAY_APPEARANCE.nicknameColor,
    nicknameRoleColors: normalizeNicknameRoleColors(
      appearance.nicknameRoleColors
    ),
    messageColorMode:
      appearance.messageColorMode === "fixed" ||
      appearance.messageColorMode === "by_role"
        ? appearance.messageColorMode
        : DEFAULT_OVERLAY_APPEARANCE.messageColorMode,
    messageColor:
      typeof appearance.messageColor === "string" &&
      /^#[0-9A-Fa-f]{6}$/.test(appearance.messageColor)
        ? appearance.messageColor.toUpperCase()
        : DEFAULT_OVERLAY_APPEARANCE.messageColor,
    messageRoleColors: normalizeMessageRoleColors(
      appearance.messageRoleColors
    ),
    messageDurationSeconds:
      appearance.messageDurationSeconds === 0 ||
      appearance.messageDurationSeconds === 10 ||
      appearance.messageDurationSeconds === 20 ||
      appearance.messageDurationSeconds === 30 ||
      appearance.messageDurationSeconds === 60
        ? appearance.messageDurationSeconds
        : DEFAULT_OVERLAY_APPEARANCE.messageDurationSeconds
  };
}

function normalizeMessageRoleColors(
  value: unknown
): OverlayAppearance["messageRoleColors"] {
  return normalizeRoleColors(
    value,
    DEFAULT_OVERLAY_APPEARANCE.messageRoleColors
  );
}

function normalizeChzzkBadgeVisibility(
  value: unknown
): OverlayAppearance["chzzkBadgeVisibility"] {
  const visibility: Record<string, unknown> =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};

  return Object.fromEntries(
    Object.entries(DEFAULT_OVERLAY_APPEARANCE.chzzkBadgeVisibility).map(
      ([kind, defaultVisible]) => [
        kind,
        typeof visibility[kind] === "boolean"
          ? visibility[kind]
          : defaultVisible
      ]
    )
  ) as OverlayAppearance["chzzkBadgeVisibility"];
}

function normalizeNicknameRoleColors(
  value: unknown
): OverlayAppearance["nicknameRoleColors"] {
  return normalizeRoleColors(
    value,
    DEFAULT_OVERLAY_APPEARANCE.nicknameRoleColors
  );
}

function normalizeRoleColors<T extends Record<string, string>>(
  value: unknown,
  defaults: T
): T {
  const colors: Record<string, unknown> =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};

  return Object.fromEntries(
    Object.entries(defaults).map(
      ([kind, defaultColor]) => {
        const color = colors[kind];
        return [
          kind,
          typeof color === "string" && /^#[0-9A-Fa-f]{6}$/.test(color)
            ? color.toUpperCase()
            : defaultColor
        ];
      }
    )
  ) as T;
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
      let appearance = { ...DEFAULT_OVERLAY_APPEARANCE };

      if (!rotate && typeof existingToken === "string") {
        const existingRef = db.collection("overlays").doc(existingToken);
        const existing = await transaction.get(existingRef);

        if (existing.exists && existing.data()?.streamerUid === streamerUid) {
          appearance = normalizeOverlayAppearance(existing.data()?.theme);
          transaction.set(
            existingRef,
            { active: true, updatedAt: FieldValue.serverTimestamp() },
            { merge: true }
          );
          return { publicToken: existingToken, active: true, appearance };
        }
      }

      if (typeof existingToken === "string") {
        const existingRef = db.collection("overlays").doc(existingToken);
        const existing = await transaction.get(existingRef);

        if (existing.exists && existing.data()?.streamerUid === streamerUid) {
          appearance = normalizeOverlayAppearance(existing.data()?.theme);
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
        theme: appearance,
        createdAt: now,
        updatedAt: now
      });
      transaction.set(
        streamerRef,
        { overlayToken: candidateToken, updatedAt: now },
        { merge: true }
      );

      return { publicToken: candidateToken, active: true, appearance };
    });

    if (result) {
      return result;
    }
  }

  throw new Error("Could not allocate a unique overlay token");
}
