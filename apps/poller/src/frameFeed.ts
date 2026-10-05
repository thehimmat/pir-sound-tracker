/**
 * Fetching runs on its own clock, separate from processing (decode + OCR).
 * A fetch starts on every whole second whether or not the last one has
 * finished, and processing always takes the newest frame. A slow fetch no
 * longer delays the next sample, and while OCR is busy the next frame is
 * already downloading.
 */

export interface FetchResult {
  /** When the fetch started; this is the reading's timestamp. */
  ts: number;
  fetchMs: number;
  buf?: Buffer;
  error?: string;
}

/**
 * Holds the newest fetch result for the processing loop. A result older than
 * one already offered or handed over is ignored, and results replaced before
 * processing reached them are counted in `skipped`.
 */
export class LatestFrame {
  private latest: FetchResult | null = null;
  private newestTs = -Infinity;
  private waiter: ((r: FetchResult) => void) | null = null;
  private skippedCount = 0;

  get skipped(): number { return this.skippedCount; }

  offer(result: FetchResult): void {
    if (result.ts <= this.newestTs) {
      this.skippedCount++;
      return;
    }
    this.newestTs = result.ts;
    if (this.waiter) {
      const w = this.waiter;
      this.waiter = null;
      w(result);
      return;
    }
    if (this.latest) this.skippedCount++;
    this.latest = result;
  }

  /** Resolves with the newest result not yet handed over. One caller at a time. */
  next(): Promise<FetchResult> {
    if (this.latest) {
      const r = this.latest;
      this.latest = null;
      return Promise.resolve(r);
    }
    return new Promise(resolve => { this.waiter = resolve; });
  }
}

/** Milliseconds from `now` to the next multiple of intervalMs. */
export function msUntilNextTick(now: number, intervalMs: number): number {
  return intervalMs - (now % intervalMs);
}

export interface FetchClockOptions {
  intervalMs: number;
  /** Ticks are skipped while this many fetches are still running. */
  maxInFlight: number;
  fetchFrame: () => Promise<Buffer>;
  onResult: (result: FetchResult) => void;
}

export interface FetchClock {
  stop(): void;
  readonly skippedTicks: number;
}

export function startFetchClock(opts: FetchClockOptions): FetchClock {
  let inFlight = 0;
  let skippedTicks = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  function tick(): void {
    if (stopped) return;
    if (inFlight >= opts.maxInFlight) {
      skippedTicks++;
    } else {
      const ts = Date.now();
      inFlight++;
      opts.fetchFrame().then(
        buf => opts.onResult({ ts, fetchMs: Date.now() - ts, buf }),
        err => opts.onResult({ ts, fetchMs: Date.now() - ts, error: err instanceof Error ? err.message : String(err) }),
      ).finally(() => { inFlight--; });
    }
    timer = setTimeout(tick, msUntilNextTick(Date.now(), opts.intervalMs));
  }

  tick();
  return {
    stop() { stopped = true; if (timer) clearTimeout(timer); },
    get skippedTicks() { return skippedTicks; },
  };
}
