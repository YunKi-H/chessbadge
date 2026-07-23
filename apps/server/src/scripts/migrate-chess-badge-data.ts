import "../config/env.js";
import { migrateLegacyChessBadgeData } from "../firebase/chess-badge-migration.js";

const projectId = requiredEnv("FIREBASE_PROJECT_ID");
const execute = process.argv.includes("--execute");
const confirmedProject = readArgument("--confirm-project=");

if (execute && confirmedProject !== projectId) {
  throw new Error(
    `Project confirmation mismatch. Expected --confirm-project=${projectId}`
  );
}

const result = await migrateLegacyChessBadgeData(execute);
console.log(`Firebase project: ${projectId}`);
console.log(
  `${execute ? "Migrated" : "Dry run"}: ${result.chzzkAccountsFound} Chzzk account(s), ${result.usersFound} user(s) found.`
);

if (execute) {
  console.log(
    `Updated ${result.chzzkAccountsMigrated} Chzzk account(s) and ${result.usersMigrated} user(s).`
  );
} else {
  console.log("No document was changed.");
  console.log(
    "To execute this build: " +
      "node apps/server/dist/scripts/migrate-chess-badge-data.js " +
      `--execute --confirm-project=${projectId}`
  );
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
