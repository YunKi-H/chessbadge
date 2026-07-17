import type { ChzzkBadgeKind } from "@elobadge/core";

export function classifyChzzkBadge(badge: unknown): ChzzkBadgeKind {
  if (!badge || typeof badge !== "object") {
    return "unknown";
  }

  const candidate = badge as { badgeType?: unknown; imageUrl?: unknown };
  const imagePath = readImagePath(candidate.imageUrl);

  if (/^\/static\/nng\/glive\/icon\/(?:manager|streamer)\.png$/i.test(imagePath)) {
    return "role";
  }

  if (imagePath.startsWith("/glive/subscription/badge/")) {
    return "subscription";
  }

  if (/^\/static\/nng\/glive\/badge\/fan_\d+\.png$/i.test(imagePath)) {
    return "donation";
  }

  if (/^\/static\/nng\/glive\/badge\/gift_sub_\d+\.png$/i.test(imagePath)) {
    return "subscription_gift";
  }

  return classifyBadgeType(candidate.badgeType);
}

function classifyBadgeType(value: unknown): ChzzkBadgeKind {
  if (typeof value !== "string") {
    return "unknown";
  }

  const type = value.toLowerCase();

  if (type.includes("gift") && type.includes("sub")) {
    return "subscription_gift";
  }

  if (type.includes("subscription")) {
    return "subscription";
  }

  if (type.includes("donation") || type.includes("fan")) {
    return "donation";
  }

  if (type.includes("manager") || type.includes("streamer") || type.includes("role")) {
    return "role";
  }

  return "unknown";
}

function readImagePath(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  try {
    return new URL(value).pathname;
  } catch {
    return "";
  }
}
