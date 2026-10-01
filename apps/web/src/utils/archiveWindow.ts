// Mirrors RAW_WINDOW_DAYS / mayBeArchived() in packages/types/src/index.ts
// (tested in apps/poller/src/__tests__/archiveWindow.test.ts). The web bundle
// cannot import runtime values from @pir/types, so keep both in sync.

/** Days of readings kept raw before the nightly job packs them into the archive. */
export const RAW_WINDOW_DAYS = 7;

/** True when a range starting at `fromTs` may be served from the slower archive. */
export function mayBeArchived(fromTs: number, nowMs: number = Date.now()): boolean {
  return fromTs < nowMs - RAW_WINDOW_DAYS * 86_400_000;
}
