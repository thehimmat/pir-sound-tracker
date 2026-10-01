import { useEffect, useState } from 'react';

// Any load that runs past this shows the "can take a few seconds" note, even
// for recent days: a cold database can be slow for the first request.
const SLOW_AFTER_MS = 2500;

interface Props {
  /** The range may come from the packed archive, which can take a few seconds. */
  archived?: boolean;
  padding?: number | string;
}

export function LoadingState({ archived = false, padding = 24 }: Props) {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => clearTimeout(id);
  }, []);

  const note = archived
    ? 'Older days are loaded from the archive and can take a few seconds.'
    : slow
      ? 'Still loading. This can take a few seconds.'
      : null;

  return (
    <div role="status" aria-live="polite" style={{ textAlign: 'center', padding, color: '#94a3b8' }}>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
        <span className="loading-spinner" aria-hidden="true" />
        Loading…
      </div>
      {note && (
        <div style={{ marginTop: 6, fontSize: 12, color: '#7c8ba1' }}>{note}</div>
      )}
    </div>
  );
}
