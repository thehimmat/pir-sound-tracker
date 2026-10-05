import type { ReadingStatus } from '@pir/types';

export interface QueuedReading {
  ts: number;
  raw_db: number | null;
  status: ReadingStatus;
}

export interface WriteQueueOptions {
  insertBatch: (rows: QueuedReading[]) => Promise<void>;
  /** Readings held while the database is unreachable. 3600 is one hour at 1 Hz. */
  maxRows?: number;
  /** Readings sent per insert. */
  batchSize?: number;
}

/**
 * In-memory buffer between the poll loop and the database. A failed write
 * keeps its readings at the front of the queue so they go out, in order, once
 * the database is back. Past maxRows the oldest readings are dropped so a long
 * outage can't grow memory without bound. Readings still queued are lost if
 * the process restarts.
 */
export class WriteQueue {
  private rows: QueuedReading[] = [];
  private inFlight = false;
  private droppedCount = 0;
  private readonly insertBatch: WriteQueueOptions['insertBatch'];
  private readonly maxRows: number;
  private readonly batchSize: number;

  constructor(opts: WriteQueueOptions) {
    this.insertBatch = opts.insertBatch;
    this.maxRows = opts.maxRows ?? 3_600;
    this.batchSize = opts.batchSize ?? 500;
  }

  get size(): number { return this.rows.length; }
  get dropped(): number { return this.droppedCount; }

  enqueue(row: QueuedReading): void {
    this.rows.push(row);
    this.enforceCap();
  }

  /**
   * Sends one batch of the oldest readings. Resolves true when the batch was
   * written or there was nothing to send, false when the write failed or
   * another flush was already in flight.
   */
  async flush(): Promise<boolean> {
    if (this.inFlight) return false;
    if (this.rows.length === 0) return true;

    this.inFlight = true;
    const batch = this.rows.splice(0, this.batchSize);
    try {
      await this.insertBatch(batch);
      return true;
    } catch {
      this.rows.unshift(...batch);
      this.enforceCap();
      return false;
    } finally {
      this.inFlight = false;
    }
  }

  private enforceCap(): void {
    const excess = this.rows.length - this.maxRows;
    if (excess > 0) {
      this.rows.splice(0, excess);
      this.droppedCount += excess;
    }
  }
}

const BASE_FLUSH_MS = 1_000;
const MAX_FLUSH_MS = 30_000;

/** Delay before the next flush: 1 s while healthy, doubling per consecutive failure up to 30 s. */
export function flushDelayMs(consecutiveFailures: number): number {
  return Math.min(MAX_FLUSH_MS, BASE_FLUSH_MS * 2 ** Math.min(consecutiveFailures, 15));
}
