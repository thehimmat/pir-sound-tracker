import type React from 'react';

export function AboutView() {
  return (
    <div style={{ maxWidth: 640, lineHeight: 1.7, fontSize: 14, color: '#cbd5e1' }}>
      <h2 style={{ fontSize: 16, fontWeight: 600, color: '#e2e8f0', marginBottom: 16 }}>
        About this project
      </h2>

      <p>
        This dashboard tracks noise levels at{' '}
        <strong style={{ color: '#e2e8f0' }}>Portland International Raceway</strong>{' '}
        in real time, 24 hours a day. Anyone can check the current reading or browse
        historical data at any point — no login required.
      </p>

      <h3 style={h3}>How it works</h3>
      <p>
        The raceway operates a sound level meter with a fixed microphone positioned
        50 feet from the track. The current reading is published on the{' '}
        <a
          href="http://portlandraceway.com/?/about/noise_information"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: '#3b82f6', textDecoration: 'none' }}
        >
          raceway's website
        </a>. Every second, a server automatically captures a snapshot of that
        display and uses{' '}
        <strong style={{ color: '#e2e8f0' }}>optical character recognition (OCR)</strong>{' '}
        — the same technology used to read text in photos — to extract the numerical
        dB value. That value is then stored in a cloud database and shown here.
      </p>
      <p>
        Because the readings are extracted from an image rather than a direct sensor
        feed, occasional misreads can occur — most often appearing as a sudden isolated
        dip to an implausibly low value. These are OCR artefacts, not real drops in
        noise level.
      </p>

      <h3 style={h3}>Noise limits</h3>
      <p>
        Under a{' '}
        <a
          href="https://portlandraceway.com/?/about/noise_information"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: '#3b82f6', textDecoration: 'none' }}
        >
          1989 agreement
        </a>{' '}
        with North Portland neighborhood groups, the Portland city code sets a
        trackside limit of <strong style={{ color: '#e2e8f0' }}>105 dBA</strong>.
        In practice, motorsport events use a stricter operational limit of{' '}
        <strong style={{ color: '#e2e8f0' }}>103 dBA</strong> — sound engineers
        determined this more accurately corresponds to 65 dB at the nearest
        residence. Vehicles exceeding 103 dBA are subject to removal from
        competition. The red dashed line on charts marks the
        103 dBA operational limit; readings at or above that level are highlighted
        in red.
      </p>

      <h3 style={h3}>2026 variance events</h3>
      <p>
        The facility is permitted up to four variance events per year at higher limits.
        The following events have been approved for 2026:
      </p>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13, marginBottom: 8 }}>
        <thead>
          <tr>
            <th style={th}>Event</th>
            <th style={th}>Dates</th>
            <th style={th}>Limit</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={td}>NTT IndyCar Series</td>
            <td style={td}>Aug 13–16 (+ 2 TBD test days)</td>
            <td style={{ ...td, color: '#ef4444', fontWeight: 600 }}>115 dB</td>
          </tr>
          <tr>
            <td style={td}>Rose Cup Races</td>
            <td style={td}>Jul 10–12</td>
            <td style={{ ...td, color: '#f59e0b', fontWeight: 600 }}>112 dB</td>
          </tr>
          <tr>
            <td style={td}>Sovren / ABFM</td>
            <td style={td}>Sep 4–6</td>
            <td style={{ ...td, color: '#f59e0b', fontWeight: 600 }}>110 dB</td>
          </tr>
        </tbody>
      </table>
      <p style={{ fontSize: 12, color: '#475569' }}>
        During variance events the red threshold line on charts still marks 103 dBA — the
        standard operational limit — for reference.
      </p>

      <h3 style={h3}>Official noise records</h3>
      <p>
        All noise recordings captured by the raceway's sound level meter are held on file
        and provided to the City of Portland's{' '}
        <strong style={{ color: '#e2e8f0' }}>Noise Control Officer</strong> on request.
        The Noise Control Officer is the official custodian of this data for regulatory
        and enforcement purposes.
      </p>

      <h3 style={h3}>Filing a noise complaint</h3>
      <p>
        Residents can report a noise concern directly through Portland's online form:
      </p>
      <p>
        <a
          href="https://www.portland.gov/oni/noise-complaints"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: '#3b82f6', textDecoration: 'none' }}
        >
          Report a noise concern — Portland.gov
        </a>
      </p>

      <h3 style={h3}>Data retention</h3>
      <p>
        Readings are stored indefinitely. You can navigate to any past day in the
        History tab and inspect noise levels at 10-minute resolution, or drill down
        to the second-by-second trace for any 10-minute window.
      </p>

      <h3 style={h3}>Built by</h3>
      <p>
        Developed by{' '}
        <a
          href="https://github.com/thehimmat"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: '#3b82f6', textDecoration: 'none' }}
        >
          Himmat Singh Khalsa
        </a>
        . Source code and methodology are available on{' '}
        <a
          href="https://github.com/thehimmat/pir-sound-tracker"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: '#3b82f6', textDecoration: 'none' }}
        >
          GitHub
        </a>
        .
      </p>
    </div>
  );
}

const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '6px 12px',
  borderBottom: '1px solid #334155',
  color: '#64748b',
  fontWeight: 500,
  fontSize: 12,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

const td: React.CSSProperties = {
  padding: '6px 12px',
  borderBottom: '1px solid #1e293b',
  color: '#cbd5e1',
};

const h3: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: '#94a3b8',
  marginTop: 20,
  marginBottom: 6,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};
