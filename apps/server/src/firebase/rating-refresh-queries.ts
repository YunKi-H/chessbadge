import type { ChessProvider } from "@elobadge/core";
import { FieldPath, Timestamp } from "firebase-admin/firestore";
import { getFirestoreDb } from "./admin.js";

export async function listDueRatingRefreshAccountIds(
  provider: ChessProvider,
  now: Date,
  limit: number
): Promise<string[]> {
  const accounts = getFirestoreDb().collection("chessAccounts");
  const dueSnapshot = await accounts
    .where("provider", "==", provider)
    .where("nextRatingRefreshAt", "<=", Timestamp.fromDate(now))
    .orderBy("nextRatingRefreshAt")
    .limit(limit)
    .get();
  const accountIds = dueSnapshot.docs.map((document) => document.id);

  if (accountIds.length >= limit) {
    return accountIds;
  }

  // Temporary compatibility path for verified accounts created before scheduling existed.
  const seenAccountIds = new Set(accountIds);
  const pageSize = Math.max(limit * 5, 100);
  let lastDocumentId: string | null = null;

  while (accountIds.length < limit) {
    let query = accounts
      .where("provider", "==", provider)
      .orderBy(FieldPath.documentId())
      .limit(pageSize);

    if (lastDocumentId) {
      query = query.startAfter(lastDocumentId);
    }

    const page = await query.get();
    for (const document of page.docs) {
      const data = document.data();
      if (
        !seenAccountIds.has(document.id) &&
        !(data.nextRatingRefreshAt instanceof Timestamp) &&
        data.verifiedAt instanceof Timestamp &&
        typeof data.uid === "string"
      ) {
        accountIds.push(document.id);
        seenAccountIds.add(document.id);
        if (accountIds.length >= limit) {
          break;
        }
      }
    }

    if (accountIds.length >= limit || page.size < pageSize) {
      break;
    }
    lastDocumentId = page.docs.at(-1)?.id ?? null;
    if (!lastDocumentId) {
      break;
    }
  }

  return accountIds;
}
