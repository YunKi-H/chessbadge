import type { ChzzkAuthConfig } from "../auth/chzzk/client.js";
import { revokeChzzkToken } from "../auth/chzzk/client.js";
import {
  deleteChzzkStreamerTokens,
  loadChzzkStreamerTokens
} from "../firebase/chzzk-tokens.js";
import { chzzkSessionService } from "./session-service.js";

interface ChzzkConnectionDependencies {
  loadTokens: typeof loadChzzkStreamerTokens;
  revokeToken: typeof revokeChzzkToken;
  deleteTokens: typeof deleteChzzkStreamerTokens;
  stopSession(uid: string): Promise<boolean>;
}

const defaultDependencies: ChzzkConnectionDependencies = {
  loadTokens: loadChzzkStreamerTokens,
  revokeToken: revokeChzzkToken,
  deleteTokens: deleteChzzkStreamerTokens,
  stopSession: (uid) => chzzkSessionService.stop(uid)
};

export class ChzzkConnectionService {
  constructor(
    private readonly dependencies: ChzzkConnectionDependencies =
      defaultDependencies
  ) {}

  async disconnect(
    uid: string,
    config: ChzzkAuthConfig
  ): Promise<{ revoked: boolean }> {
    let storedTokens;

    try {
      storedTokens = await this.dependencies.loadTokens(uid);
    } catch (error) {
      await this.dependencies.stopSession(uid);
      throw error;
    }

    if (!storedTokens) {
      return { revoked: false };
    }

    await this.dependencies.stopSession(uid);
    await this.dependencies.revokeToken(
      config,
      storedTokens.refreshToken,
      "refresh_token"
    );
    await this.dependencies.deleteTokens(uid);

    return { revoked: true };
  }
}

export const chzzkConnectionService = new ChzzkConnectionService();
