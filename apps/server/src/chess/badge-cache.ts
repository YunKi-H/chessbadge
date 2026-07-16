import type { RatingBadge } from "@elobadge/core";
import { getChzzkRatingBadge } from "../firebase/chess-badges.js";

const DEFAULT_TTL_MS = 10 * 60_000;
const DEFAULT_MAX_ENTRIES = 10_000;

interface CacheEntry {
  badge: RatingBadge | null;
  expiresAt: number;
}

export class RatingBadgeCache {
  private readonly entries = new Map<string, CacheEntry>();
  private readonly pending = new Map<string, Promise<RatingBadge | null>>();
  private readonly versions = new Map<string, number>();

  constructor(
    private readonly loadBadge: (channelId: string) => Promise<RatingBadge | null>,
    private readonly ttlMs = DEFAULT_TTL_MS,
    private readonly maxEntries = DEFAULT_MAX_ENTRIES
  ) {}

  async get(channelId: string): Promise<RatingBadge | null> {
    const cached = this.entries.get(channelId);

    if (cached && cached.expiresAt > Date.now()) {
      return cached.badge ? { ...cached.badge } : null;
    }

    const existingLoad = this.pending.get(channelId);

    if (existingLoad) {
      return existingLoad;
    }

    const version = this.versions.get(channelId) ?? 0;
    const load = this.loadBadge(channelId)
      .then((badge) => {
        if ((this.versions.get(channelId) ?? 0) === version) {
          this.ensureCapacity();
          this.entries.set(channelId, {
            badge: badge ? { ...badge } : null,
            expiresAt: Date.now() + this.ttlMs
          });
        }
        return badge ? { ...badge } : null;
      })
      .finally(() => {
        if (this.pending.get(channelId) === load) {
          this.pending.delete(channelId);
        }
      });

    this.pending.set(channelId, load);
    return load;
  }

  invalidate(channelId: string): void {
    this.versions.set(channelId, (this.versions.get(channelId) ?? 0) + 1);
    this.entries.delete(channelId);
    this.pending.delete(channelId);
  }

  clear(): void {
    this.entries.clear();
    this.pending.clear();
    this.versions.clear();
  }

  private ensureCapacity(): void {
    if (this.entries.size < this.maxEntries) {
      return;
    }

    const firstKey = this.entries.keys().next().value;

    if (typeof firstKey === "string") {
      this.entries.delete(firstKey);
    }
  }
}

export const ratingBadgeCache = new RatingBadgeCache(getChzzkRatingBadge);
