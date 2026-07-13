import { OneTimeStore } from "../auth/one-time-store.js";
import type { ChzzkLoginMode } from "@chessbadge/core";

export interface FirebaseLoginExchange {
  customToken: string;
  mode: ChzzkLoginMode;
  user: {
    uid: string;
    chzzkChannelId: string;
    displayName: string;
  };
}

const loginExchanges = new OneTimeStore<FirebaseLoginExchange>(2 * 60 * 1_000);

export function issueFirebaseLoginCode(exchange: FirebaseLoginExchange): string {
  return loginExchanges.issue(exchange);
}

export function consumeFirebaseLoginCode(code: string): FirebaseLoginExchange | null {
  return loginExchanges.consume(code);
}
