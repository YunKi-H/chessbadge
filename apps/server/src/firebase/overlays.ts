import { randomBytes } from "node:crypto";
import {
  DEFAULT_OVERLAY_APPEARANCE,
  isOverlayFontFamily,
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
    super("스트리머 인증이 필요합니다. 치지직 스트리머로 다시 연결해 주세요.");
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

  const appearance = parseOverlayAppearance(data.theme);
  if (!appearance) {
    return null;
  }

  return {
    publicToken,
    active: data.active,
    appearance
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

  const appearance = parseOverlayAppearance(data.theme);
  if (!appearance) {
    return null;
  }

  return {
    streamerUid: data.streamerUid,
    appearance
  };
}

export function parseOverlayAppearance(value: unknown): OverlayAppearance | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const appearance = value as Record<string, unknown>;
  const chzzkBadgeVisibility = parseChzzkBadgeVisibility(
    appearance.chzzkBadgeVisibility
  );
  const nicknameRoleColors = parseRoleColors(
    appearance.nicknameRoleColors,
    DEFAULT_OVERLAY_APPEARANCE.nicknameRoleColors
  );
  const messageRoleColors = parseRoleColors(
    appearance.messageRoleColors,
    DEFAULT_OVERLAY_APPEARANCE.messageRoleColors
  );

  if (
    typeof appearance.messageMaxWidthPx !== "number" ||
    !Number.isInteger(appearance.messageMaxWidthPx) ||
    appearance.messageMaxWidthPx < 300 ||
    appearance.messageMaxWidthPx > 600 ||
    typeof appearance.backgroundVisible !== "boolean" ||
    !isHexColor(appearance.backgroundColor) ||
    typeof appearance.backgroundOpacity !== "number" ||
    !Number.isInteger(appearance.backgroundOpacity) ||
    appearance.backgroundOpacity < 0 ||
    appearance.backgroundOpacity > 100 ||
    typeof appearance.chzzkBadgesVisible !== "boolean" ||
    !chzzkBadgeVisibility ||
    !isRatingProviderPolicy(appearance.ratingProviderPolicy) ||
    typeof appearance.nicknameVisible !== "boolean" ||
    !isNicknameColorMode(appearance.nicknameColorMode) ||
    !isHexColor(appearance.nicknameColor) ||
    !nicknameRoleColors ||
    !isMessageColorMode(appearance.messageColorMode) ||
    !isHexColor(appearance.messageColor) ||
    !messageRoleColors ||
    !isOverlayFontFamily(appearance.fontFamily) ||
    typeof appearance.fontSizePx !== "number" ||
    !Number.isInteger(appearance.fontSizePx) ||
    appearance.fontSizePx < 12 ||
    appearance.fontSizePx > 36 ||
    !isFontWeight(appearance.fontWeight) ||
    !isFontLineHeight(appearance.fontLineHeight) ||
    !isMessageDuration(appearance.messageDurationSeconds)
  ) {
    return null;
  }

  return {
    messageMaxWidthPx: appearance.messageMaxWidthPx,
    backgroundVisible: appearance.backgroundVisible,
    backgroundColor: appearance.backgroundColor.toUpperCase(),
    backgroundOpacity: appearance.backgroundOpacity,
    chzzkBadgesVisible: appearance.chzzkBadgesVisible,
    chzzkBadgeVisibility,
    ratingProviderPolicy: appearance.ratingProviderPolicy,
    nicknameVisible: appearance.nicknameVisible,
    nicknameColorMode: appearance.nicknameColorMode,
    nicknameColor: appearance.nicknameColor.toUpperCase(),
    nicknameRoleColors,
    messageColorMode: appearance.messageColorMode,
    messageColor: appearance.messageColor.toUpperCase(),
    messageRoleColors,
    fontFamily: appearance.fontFamily,
    fontSizePx: appearance.fontSizePx,
    fontWeight: appearance.fontWeight,
    fontLineHeight: appearance.fontLineHeight,
    messageDurationSeconds: appearance.messageDurationSeconds
  };
}

function parseChzzkBadgeVisibility(
  value: unknown
): OverlayAppearance["chzzkBadgeVisibility"] | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const visibility = value as Record<string, unknown>;
  const keys = Object.keys(DEFAULT_OVERLAY_APPEARANCE.chzzkBadgeVisibility);
  if (keys.some((kind) => typeof visibility[kind] !== "boolean")) {
    return null;
  }

  return Object.fromEntries(
    keys.map((kind) => [kind, visibility[kind]])
  ) as OverlayAppearance["chzzkBadgeVisibility"];
}

function parseRoleColors<T extends Record<string, string>>(
  value: unknown,
  shape: T
): T | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const colors = value as Record<string, unknown>;
  const keys = Object.keys(shape);
  if (keys.some((kind) => !isHexColor(colors[kind]))) {
    return null;
  }

  return Object.fromEntries(
    keys.map((kind) => [kind, (colors[kind] as string).toUpperCase()])
  ) as T;
}

function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9A-Fa-f]{6}$/.test(value);
}

function isRatingProviderPolicy(
  value: unknown
): value is OverlayAppearance["ratingProviderPolicy"] {
  return value === "viewer_choice" || value === "chesscom_only" ||
    value === "lichess_only" || value === "hidden";
}

function isNicknameColorMode(
  value: unknown
): value is OverlayAppearance["nicknameColorMode"] {
  return value === "fixed" || value === "by_user" || value === "by_role";
}

function isMessageColorMode(
  value: unknown
): value is OverlayAppearance["messageColorMode"] {
  return value === "fixed" || value === "by_role";
}

function isFontWeight(value: unknown): value is OverlayAppearance["fontWeight"] {
  return value === 400 || value === 500 || value === 600 ||
    value === 700 || value === 900;
}

function isFontLineHeight(
  value: unknown
): value is OverlayAppearance["fontLineHeight"] {
  return value === 1.2 || value === 1.4 || value === 1.6;
}

function isMessageDuration(
  value: unknown
): value is OverlayAppearance["messageDurationSeconds"] {
  return value === 0 || value === 10 || value === 20 || value === 30 ||
    value === 60;
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
          appearance = requireStoredOverlayAppearance(existing.data()?.theme);
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
          appearance = requireStoredOverlayAppearance(existing.data()?.theme);
          transaction.delete(existingRef);
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

function requireStoredOverlayAppearance(value: unknown): OverlayAppearance {
  const appearance = parseOverlayAppearance(value);
  if (!appearance) {
    throw new Error("Stored overlay appearance is invalid");
  }
  return appearance;
}
