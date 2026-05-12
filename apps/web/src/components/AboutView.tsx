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
        competition. The facility also permits up to four variance events per year
        at higher limits (110–115 dB). The red dashed line on charts marks the
        103 dBA operational limit; readings at or above that level are highlighted
        in red.
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

const h3: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: '#94a3b8',
  marginTop: 20,
  marginBottom: 6,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};
