import React, { useEffect, useState } from 'react';
import { getDayStatus } from '../utils/varianceEvents.js';

const TRACK_TZ = 'America/Los_Angeles';

const dateFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TRACK_TZ,
  weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
});

const timeFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TRACK_TZ,
  hour: 'numeric', minute: '2-digit',
});

export function StatusBanner() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const s = getDayStatus(now);

  // Race days get the warm warning treatment; everything else stays quiet
  const raceDay = s.event !== null;
  const container: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: '4px 16px',
    padding: '8px 16px',
    borderRadius: 8,
    marginBottom: 16,
    background: raceDay ? '#7c2d12' : '#151a24',
    border: `1px solid ${raceDay ? '#ef4444' : '#1e293b'}`,
  };

  return (
    <div style={container}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: raceDay ? '#fef2f2' : '#e2e8f0' }}>
          {s.headline}
          {raceDay && s.event?.note && (
            <span style={{ fontWeight: 400, color: '#f87171' }}> ({s.event.note})</span>
          )}
        </div>
        <div style={{ fontSize: 12, color: raceDay ? '#fca5a5' : '#94a3b8', marginTop: 2 }}>
          {s.hoursNote}
          {' · '}
          Current limit: <strong style={{ color: raceDay ? '#fef2f2' : '#e2e8f0' }}>{s.limitDb} dBA</strong>
        </div>
      </div>
      <div style={{ textAlign: 'right', color: raceDay ? '#fca5a5' : '#7c8ba1', fontSize: 12, whiteSpace: 'nowrap' }}>
        <div>{dateFmt.format(now)}</div>
        <div style={{ marginTop: 2 }}>{timeFmt.format(now)} PT</div>
      </div>
    </div>
  );
}
