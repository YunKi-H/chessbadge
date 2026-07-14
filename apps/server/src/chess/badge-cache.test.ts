import assert from "node:assert/strict";
import test from "node:test";
import { RatingBadgeCache } from "./badge-cache.js";

test("rating badge cache reuses a loaded badge until invalidated", async () => {
  let loads = 0;
  const cache = new RatingBadgeCache(async () => {
    loads += 1;
    return {
      provider: "chesscom",
      speed: "rapid",
      value: 1520,
      provisional: false
    };
  });

  assert.equal((await cache.get("viewer"))?.value, 1520);
  assert.equal((await cache.get("viewer"))?.value, 1520);
  assert.equal(loads, 1);

  cache.invalidate("viewer");
  await cache.get("viewer");
  assert.equal(loads, 2);
});

test("rating badge cache coalesces concurrent Firestore lookups", async () => {
  let loads = 0;
  const cache = new RatingBadgeCache(async () => {
    loads += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return null;
  });

  await Promise.all([cache.get("viewer"), cache.get("viewer")]);

  assert.equal(loads, 1);
});

test("an invalidated in-flight lookup cannot overwrite a newer badge", async () => {
  let releaseFirst: (() => void) | undefined;
  let value = 1500;
  let loads = 0;
  const cache = new RatingBadgeCache(async () => {
    loads += 1;
    const loadedValue = value;

    if (loads === 1) {
      await new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });
    }

    return {
      provider: "chesscom",
      speed: "rapid",
      value: loadedValue,
      provisional: false
    };
  });

  const oldLookup = cache.get("viewer");
  await waitFor(() => loads === 1);
  value = 1600;
  cache.invalidate("viewer");
  assert.equal((await cache.get("viewer"))?.value, 1600);
  releaseFirst?.();
  await oldLookup;

  assert.equal((await cache.get("viewer"))?.value, 1600);
});

async function waitFor(predicate: () => boolean) {
  while (!predicate()) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}
