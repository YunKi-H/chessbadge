import { EventEmitter } from "node:events";
import type { OverlayAppearance } from "@chessbadge/core";

const overlayAccessEvents = new EventEmitter();
overlayAccessEvents.setMaxListeners(100);

export function revokeOverlayConnections(publicToken: string): void {
  overlayAccessEvents.emit(revocationEventName(publicToken));
}

export function subscribeOverlayRevocation(
  publicToken: string,
  listener: () => void
): () => void {
  const eventName = revocationEventName(publicToken);
  overlayAccessEvents.on(eventName, listener);

  return () => {
    overlayAccessEvents.off(eventName, listener);
  };
}

export function publishOverlayAppearance(
  publicToken: string,
  appearance: OverlayAppearance
): void {
  overlayAccessEvents.emit(appearanceEventName(publicToken), appearance);
}

export function subscribeOverlayAppearance(
  publicToken: string,
  listener: (appearance: OverlayAppearance) => void
): () => void {
  const eventName = appearanceEventName(publicToken);
  overlayAccessEvents.on(eventName, listener);

  return () => {
    overlayAccessEvents.off(eventName, listener);
  };
}

function revocationEventName(publicToken: string) {
  return `revoked:${publicToken}`;
}

function appearanceEventName(publicToken: string) {
  return `appearance:${publicToken}`;
}
