import { EventEmitter } from "node:events";

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

function revocationEventName(publicToken: string) {
  return `revoked:${publicToken}`;
}
