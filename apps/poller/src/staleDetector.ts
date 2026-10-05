/**
 * Flags a frozen meter feed: the same frame for longer than staleAfterMs.
 * Identical frames within that window stay ok, since the meter can hold a
 * value for a while on a quiet night. This is the only frame comparison the
 * poller makes.
 */
export class StaleDetector {
  private hash: string | null = null;
  private firstSeenTs = 0;

  constructor(private readonly staleAfterMs: number) {}

  /** Records this frame's hash and returns true if the feed is stale. */
  check(hash: string, ts: number): boolean {
    if (hash !== this.hash) {
      this.hash = hash;
      this.firstSeenTs = ts;
      return false;
    }
    return ts - this.firstSeenTs > this.staleAfterMs;
  }
}
