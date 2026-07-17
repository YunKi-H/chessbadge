import type { ChzzkAuthConfig } from "../auth/chzzk/client.js";
import { revokeChzzkToken } from "../auth/chzzk/client.js";
import {
  deleteChzzkStreamerTokens,
  listChzzkStreamerTokenUids,
  loadChzzkStreamerTokens
} from "../firebase/chzzk-tokens.js";

interface BulkTokenRevocationDependencies {
  listUids: typeof listChzzkStreamerTokenUids;
  loadTokens: typeof loadChzzkStreamerTokens;
  revokeToken: typeof revokeChzzkToken;
  deleteTokens: typeof deleteChzzkStreamerTokens;
}

const defaultDependencies: BulkTokenRevocationDependencies = {
  listUids: listChzzkStreamerTokenUids,
  loadTokens: loadChzzkStreamerTokens,
  revokeToken: revokeChzzkToken,
  deleteTokens: deleteChzzkStreamerTokens
};

export interface BulkTokenRevocationFailure {
  uid: string;
  error: unknown;
}

export interface BulkTokenRevocationResult {
  total: number;
  revoked: string[];
  skipped: string[];
  failures: BulkTokenRevocationFailure[];
}

export async function revokeAllChzzkStreamerTokens(
  config: ChzzkAuthConfig,
  dependencies: BulkTokenRevocationDependencies = defaultDependencies
): Promise<BulkTokenRevocationResult> {
  const uids = await dependencies.listUids();
  const result: BulkTokenRevocationResult = {
    total: uids.length,
    revoked: [],
    skipped: [],
    failures: []
  };

  // Keep requests sequential so a one-off migration does not burst the Chzzk API.
  for (const uid of uids) {
    try {
      const tokens = await dependencies.loadTokens(uid);

      if (!tokens) {
        result.skipped.push(uid);
        continue;
      }

      await dependencies.revokeToken(
        config,
        tokens.refreshToken,
        "refresh_token"
      );
      await dependencies.deleteTokens(uid);
      result.revoked.push(uid);
    } catch (error) {
      result.failures.push({ uid, error });
    }
  }

  return result;
}
