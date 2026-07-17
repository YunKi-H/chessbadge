import "../config/env.js";
import { getChzzkAuthConfig } from "../auth/chzzk/client.js";
import { revokeAllChzzkStreamerTokens } from "../chzzk/bulk-token-revocation.js";
import { listChzzkStreamerTokenUids } from "../firebase/chzzk-tokens.js";

const projectId = requiredEnv("FIREBASE_PROJECT_ID");
const execute = process.argv.includes("--execute");
const confirmedProject = readArgument("--confirm-project=");
const uids = await listChzzkStreamerTokenUids();

if (!execute) {
  console.log(`Dry run: found ${uids.length} Chzzk token document(s).`);
  console.log(`Firebase project: ${projectId}`);
  console.log("No token was revoked or deleted.");
  console.log(
    `To execute: pnpm chzzk:revoke-all --execute --confirm-project=${projectId}`
  );
  process.exit(0);
}

if (confirmedProject !== projectId) {
  throw new Error(
    `Project confirmation mismatch. Expected --confirm-project=${projectId}`
  );
}

console.log(
  `Revoking ${uids.length} Chzzk token document(s) in Firebase project ${projectId}...`
);

const result = await revokeAllChzzkStreamerTokens(getChzzkAuthConfig());

for (const failure of result.failures) {
  console.error(`Failed to revoke ${failure.uid}:`, failure.error);
}

console.log(
  `Finished: ${result.revoked.length} revoked, ${result.alreadyInvalid.length} already invalid and removed, ${result.skipped.length} skipped, ${result.failures.length} failed.`
);

if (result.failures.length > 0) {
  process.exitCode = 1;
}

function readArgument(prefix: string): string | null {
  const argument = process.argv.find((value) => value.startsWith(prefix));
  return argument?.slice(prefix.length) ?? null;
}

function requiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing ${name}`);
  }

  return value;
}
